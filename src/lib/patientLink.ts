// Signed links for the patient view.
//
// Patients in India will not install a per-clinic app, but 94% of WhatsApp
// users open it daily — so the doctor sends a link and it just opens. That
// means the link itself is the credential, and it has to behave like one:
// unguessable, expiring, and scoped to a single patient.
//
// Stateless by design: the token carries the patient id and an expiry, signed
// with a dedicated secret. Nothing to store, nothing to clean up. The tradeoff
// is that revoking one patient's link means rotating the secret (which
// invalidates all of them) — acceptable while a link lasts weeks, and the
// reason a `v` version field is already in the payload for per-patient
// revocation later.

const ENC = new TextEncoder();
export const PATIENT_LINK_DAYS = 120;

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

export async function createPatientToken(
  patientId: string,
  days = PATIENT_LINK_DAYS
): Promise<string> {
  const payload = JSON.stringify({
    p: patientId,
    e: Date.now() + days * 86400000,
    v: 1,
  });
  const encoded = b64url(ENC.encode(payload));
  return `${encoded}.${await sign(encoded)}`;
}

/** Returns the patient id, or null if the token is malformed, forged or expired. */
export async function readPatientToken(token: string): Promise<string | null> {
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
    const { p, e } = JSON.parse(fromB64url(encoded)) as { p: string; e: number };
    if (!p || typeof e !== "number" || Date.now() > e) return null;
    return p;
  } catch {
    return null;
  }
}
