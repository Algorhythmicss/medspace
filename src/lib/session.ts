import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isValidSession, sessionCookieName } from "@/lib/auth";

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
