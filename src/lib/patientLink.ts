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
    const { p, e, v } = JSON.parse(fromB64url(encoded)) as {
      p: string;
      e: number;
      v?: number;
    };
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
