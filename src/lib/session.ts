import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  isValidSession,
  sessionCookieName,
  createSessionValue,
  sessionMaxAge,
} from "@/lib/auth";
import {
  createPatientSession,
  readPatientSessionValue,
  PATIENT_SESSION_DAYS,
} from "@/lib/patientLink";

// The clinic session check, for use inside server actions and route handlers.
//
// The proxy/middleware gate is defence in depth, not the authorization
// boundary: a Server Action is a POST to whatever route its component happens
// to live on, and Next dispatches it by action id, so a route that is exempt
// from the gate (or a component that later moves to one) would let an action
// run unauthenticated. Every doctor-side action calls this first. Kept out of
// auth.ts so that file stays pure Web Crypto and safe to import from the Edge.

export async function hasClinicSession(): Promise<boolean> {
  const jar = await cookies();
  return isValidSession(jar.get(sessionCookieName)?.value);
}

/** Throws a redirect to /login if there is no valid clinic session. */
export async function assertClinicSession(): Promise<void> {
  if (!(await hasClinicSession())) redirect("/login");
}

// ── Front-desk (staff) session ──────────────────────────────────────────────
// A separate cookie so a staff login can never satisfy a doctor check. Same
// HMAC + secret and a 12h life; the ONLY thing it grants is the /queue screen.

const STAFF_COOKIE = "medspace_staff";

export async function setStaffSession(): Promise<void> {
  const jar = await cookies();
  jar.set(STAFF_COOKIE, await createSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAge,
  });
}

export async function hasStaffSession(): Promise<boolean> {
  const jar = await cookies();
  return isValidSession(jar.get(STAFF_COOKIE)?.value);
}

export async function clearStaffSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(STAFF_COOKIE);
}

/** The queue is reachable by either the doctor or the front desk. */
export async function assertQueueAccess(): Promise<void> {
  if (!(await hasClinicSession()) && !(await hasStaffSession())) redirect("/login");
}

// ── Patient session ─────────────────────────────────────────────────────────
// medSpace's own durable credential for a returning patient — deliberately not
// Google's session (which would auto-renew indefinitely and silently reopen a
// family member's record on a shared phone). Ours is a signed 60-day cookie we
// control, cut off by bumping the patient's linkVersion like any other link.

const PATIENT_COOKIE = "medspace_patient";

export async function setPatientSession(patientId: string, linkVersion: number): Promise<void> {
  const jar = await cookies();
  jar.set(PATIENT_COOKIE, await createPatientSession(patientId, linkVersion), {
    httpOnly: true,
    // "lax", not "strict": /plan is reached at the end of a redirect chain that
    // starts at accounts.google.com; "strict" would drop the cookie on that hop.
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PATIENT_SESSION_DAYS * 86400,
  });
}

/** The signed-in patient id and the link version the session was minted at, or
 *  null. The caller compares the version against the patient's current one. */
export async function readPatientSession(): Promise<{ p: string; v: number } | null> {
  const jar = await cookies();
  return readPatientSessionValue(jar.get(PATIENT_COOKIE)?.value ?? "");
}

export async function clearPatientSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(PATIENT_COOKIE);
}
