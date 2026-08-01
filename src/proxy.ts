import { NextRequest, NextResponse } from "next/server";
import { isValidSession, sessionCookieName } from "@/lib/auth";

// Everything is behind the passcode except the login screen itself. Patient
// records must never be reachable from a bare URL. (This is the file Next 16
// calls "proxy"; it used to be "middleware" — same job, same Edge runtime.)
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Public surfaces — none may be forced through the clinic passcode:
  //  /login, /welcome*   pre-auth screens
  //  /p/*                patient view, carries its own signed token in the path
  //  /auth/*             the Google OAuth callback (validates itself)
  //  /plan               returning patient, authed by its own medspace_patient
  //                      cookie (exact match, not a /plans* prefix)
  if (
    pathname === "/login" ||
    pathname.startsWith("/welcome") ||
    pathname.startsWith("/p/") ||
    pathname.startsWith("/auth/") ||
    pathname === "/plan"
  ) {
    return NextResponse.next();
  }

  // Role is carried in the SIGNED session value, not just the cookie name — the
  // two cookies share a secret, so without the role check a staff value dropped
  // into the doctor cookie would pass. Validate each against its own role.
  const isDoctor = await isValidSession(req.cookies.get(sessionCookieName)?.value, "doctor");
  const isStaff = await isValidSession(req.cookies.get("medspace_staff")?.value, "staff");

  // The front-desk queue is the one gated screen staff may reach. Everything
  // else clinical is doctor-only; a staff session on any of those is bounced to
  // the queue, never to the patient records it must not see.
  const isQueue = pathname === "/queue" || pathname.startsWith("/queue/");
  if (isQueue) {
    if (isDoctor || isStaff) return NextResponse.next();
  } else if (isDoctor) {
    return NextResponse.next();
  } else if (isStaff) {
    const url = req.nextUrl.clone();
    url.pathname = "/queue";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const url = req.nextUrl.clone();
  // Someone landing on the bare domain is asked who they are; a deep link into
  // a clinic screen goes straight to the passcode and returns afterwards.
  if (pathname === "/") {
    url.pathname = "/welcome";
    url.search = "";
  } else {
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
  }
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals and the art assets; guard every real route. The old
  // pattern excluded ANY path ending .png/.jpg/.svg/... which meant a request
  // like /patients/<id>.png or /api/reports/<id>/file.png skipped the gate
  // entirely — a bypass one careless route away from leaking data. Exclude by
  // prefix (what actually lives in public/) instead of by extension.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|art/|file\\.svg|globe\\.svg|next\\.svg|vercel\\.svg|window\\.svg).*)",
  ],
};
