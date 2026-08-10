// Session handling for the single-clinic passcode gate. Uses Web Crypto only,
// so the same code runs in middleware (Edge) and in server actions.

const COOKIE = "medspace_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // a week — sign in once, not every day

function secret(): string {
  const s = process.env.MEDSPACE_SESSION_SECRET;
  if (!s) throw new Error("MEDSPACE_SESSION_SECRET is not set");
  return s;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return b64url(new Uint8Array(sig));
}

export const sessionCookieName = COOKIE;
export const sessionMaxAge = MAX_AGE_SECONDS;

// A session is either the doctor's (full clinical access) or the front desk's
// (queue only). The role is baked into the SIGNED payload, not just the cookie
// name: both cookies are HMAC'd with the same secret, so a value minted for one
// is byte-for-byte a valid value for the other. Without the role, a receptionist
// could copy their medspace_staff cookie into medspace_session and walk straight
// into the patient records — the exact boundary the two roles exist to keep.
export type SessionKind = "doctor" | "staff";

export async function createSessionValue(kind: SessionKind = "doctor"): Promise<string> {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${expires}:${kind}`;
  return `${payload}.${await sign(payload)}`;
}

export async function isValidSession(
  value: string | undefined,
  kind: SessionKind = "doctor"
): Promise<boolean> {
  if (!value) return false;
  const dot = value.lastIndexOf(".");
  if (dot < 1) return false;
  const payload = value.slice(0, dot);
  const provided = value.slice(dot + 1);

  const expected = await sign(payload);
  // constant-time-ish compare
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return false;

  // payload is "<expires>:<kind>". The role must match the door being checked;
  // a legacy value without a role no longer validates (its holder simply signs
  // in again — one re-login, and the session then lasts a week).
  const sep = payload.lastIndexOf(":");
  if (sep < 1) return false;
  if (payload.slice(sep + 1) !== kind) return false;
  const expires = Number(payload.slice(0, sep));
  return Number.isFinite(expires) && Date.now() < expires;
}

// Salted hash of the login client key (IP) for the throttle table, so a raw IP
// is never stored. Salted with the session secret — a stolen DB dump can't be
// reversed to addresses without it. Web Crypto, so it also runs on the Edge.
export async function hashLoginKey(raw: string): Promise<string> {
  const data = new TextEncoder().encode(`${raw}:${secret()}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return b64url(new Uint8Array(digest));
}

function constantEquals(input: string, expected: string | undefined): boolean {
  if (!expected) return false;
  if (input.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= input.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function passcodeMatches(input: string): boolean {
  return constantEquals(input, process.env.MEDSPACE_PASSCODE);
}

/** Front-desk passcode — opens ONLY the queue, no clinical access. Distinct
 *  from the doctor passcode; if unset, staff login is simply disabled. */
export function staffPasscodeMatches(input: string): boolean {
  const staff = process.env.MEDSPACE_STAFF_PASSCODE;
  // never let an empty/unset staff passcode collide with the doctor's
  if (!staff || staff === process.env.MEDSPACE_PASSCODE) return false;
  return constantEquals(input, staff);
}
