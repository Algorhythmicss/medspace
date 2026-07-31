// Signed links for the patient view.
//
// Patients in India will not install a per-clinic app, but 94% of WhatsApp
// users open it daily — so the doctor sends a link and it just opens. That
// means the link itself is the credential, and it has to behave like one:
// unguessable, expiring, and scoped to a single patient.
//
// Stateless by design: the token carries the patient id, an expiry, and a link
// version, signed with a dedicated secret. Nothing to store, nothing to clean
// up. Per-patient revocation is the `v` field: the token is minted at the
// patient's current `linkVersion`, and the patient page rejects any token whose
// `v` no longer matches — so bumping one patient's version cuts off exactly
// their outstanding links without touching anyone else. (Rotating the secret
// remains the blunt "revoke everyone at once" lever.)

const ENC = new TextEncoder();
// 30, not 120: the doctor re-sends from every chart, so a short life costs
// nothing, and it quarters the blast radius of a link that reached the wrong
// number. Live links keep working until their own absolute expiry passes.
export const PATIENT_LINK_DAYS = 30;

function secret(): string {
  const s = process.env.MEDSPACE_PATIENT_LINK_SECRET;
  if (!s) throw new Error("MEDSPACE_PATIENT_LINK_SECRET is not set");
  return s;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): string {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  return atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    ENC.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, ENC.encode(payload));
  return b64url(new Uint8Array(sig));
}

// `linkVersion` is last and defaults to 1 so the existing test suite — which
// calls createPatientToken(id) and createPatientToken(id, -1) — keeps passing
// unmodified (AGENTS.md). Real call sites pass the patient's current version.
export async function createPatientToken(
  patientId: string,
  days = PATIENT_LINK_DAYS,
  linkVersion = 1
): Promise<string> {
  const payload = JSON.stringify({
    p: patientId,
    e: Date.now() + days * 86400000,
    v: linkVersion,
  });
  const encoded = b64url(ENC.encode(payload));
  return `${encoded}.${await sign(encoded)}`;
}

/**
 * Full validation: verifies the signature and expiry and returns the patient id
 * together with the link version the token was minted at, or null if the token
 * is malformed, forged or expired. The version is compared against the
 * patient's current `linkVersion` by the caller (which already has the patient
 * loaded), which is where per-patient revocation actually bites.
 */
export async function readPatientLink(
  token: string
): Promise<{ p: string; v: number } | null> {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const encoded = token.slice(0, dot);
  const provided = token.slice(dot + 1);

  const expected = await sign(encoded);
  if (provided.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) return null;

  try {
    const { p, e, v, k } = JSON.parse(fromB64url(encoded)) as {
      p: string;
      e: number;
      v?: number;
      k?: string;
    };
    // A plan token has no `k` (legacy) or k:"plan". Reject bind/who/sess tokens
    // here so a session cookie value can never be replayed as a plan URL, even
    // though it also carries p/v/e. Absent `k` must still pass.
    if (k !== undefined && k !== "plan") return null;
    if (!p || typeof e !== "number" || Date.now() > e) return null;
    // Legacy tokens issued before versioning carried `v: 1`; default to 1 so
    // they keep resolving against a patient still on the default version.
    return { p, v: typeof v === "number" ? v : 1 };
  } catch {
    return null;
  }
}

/** Returns the patient id, or null if the token is malformed, forged or expired. */
export async function readPatientToken(token: string): Promise<string | null> {
  return (await readPatientLink(token))?.p ?? null;
}

// ── Other signed tokens ────────────────────────────────────────────────────
// Same HMAC and the same secret, so there is one trust domain; a `k` (kind)
// discriminator prevents a token of one kind being accepted where another is
// expected. Plan tokens deliberately have NO `k` (see readPatientLink's guard,
// which accepts absent `k` so 120-day links already in the wild keep working).
// All of these are carried in HttpOnly cookies, never in a URL.

const MIN = 60000;

async function verify(token: string): Promise<Record<string, unknown> | null> {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const encoded = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const expected = await sign(encoded);
  if (provided.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const obj = JSON.parse(fromB64url(encoded)) as Record<string, unknown>;
    if (typeof obj.e !== "number" || Date.now() > obj.e) return null;
    return obj;
  } catch {
    return null;
  }
}

async function mint(payload: Record<string, unknown>): Promise<string> {
  const encoded = b64url(ENC.encode(JSON.stringify(payload)));
  return `${encoded}.${await sign(encoded)}`;
}

/** Short-lived proof, set as an HttpOnly cookie when a link-holder starts the
 *  Google flow, that the bind about to happen is for patient `p` at version `v`. */
export async function createBindToken(p: string, v: number): Promise<string> {
  return mint({ k: "bind", p, v, e: Date.now() + 10 * MIN });
}
export async function readBindToken(token: string): Promise<{ p: string; v: number } | null> {
  const o = await verify(token);
  if (!o || o.k !== "bind" || typeof o.p !== "string" || typeof o.v !== "number") return null;
  return { p: o.p, v: o.v };
}

/** Short-lived list of the patients a Google account resolves to, when it is
 *  more than one (a shared family account) — carried to the chooser screen. */
export async function createChooserToken(ids: string[], sub: string): Promise<string> {
  return mint({ k: "who", ids, s: sub, e: Date.now() + 10 * MIN });
}
export async function readChooserToken(token: string): Promise<{ ids: string[]; s: string } | null> {
  const o = await verify(token);
  if (!o || o.k !== "who" || !Array.isArray(o.ids) || typeof o.s !== "string") return null;
  if (!o.ids.every((x) => typeof x === "string")) return null;
  return { ids: o.ids as string[], s: o.s };
}

/** The durable patient session — medSpace's own credential, not Google's.
 *  60 days so returning is one tap; carries the link version so a doctor's
 *  "reset links" cuts it off like any other outstanding link. */
export const PATIENT_SESSION_DAYS = 60;
export async function createPatientSession(p: string, v: number): Promise<string> {
  return mint({ k: "sess", p, v, e: Date.now() + PATIENT_SESSION_DAYS * 86400000 });
}
export async function readPatientSessionValue(
  token: string
): Promise<{ p: string; v: number } | null> {
  const o = await verify(token);
  if (!o || o.k !== "sess" || typeof o.p !== "string" || typeof o.v !== "number") return null;
  return { p: o.p, v: o.v };
}
