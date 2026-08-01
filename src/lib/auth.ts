// Session handling for the single-clinic passcode gate. Uses Web Crypto only,
// so the same code runs in middleware (Edge) and in server actions.

const COOKIE = "medspace_session";
const MAX_AGE_SECONDS = 60 * 60 * 12; // a clinic day; re-entry each morning

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

export async function createSessionValue(): Promise<string> {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = String(expires);
  return `${payload}.${await sign(payload)}`;
}

export async function isValidSession(value: string | undefined): Promise<boolean> {
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

  const expires = Number(payload);
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
