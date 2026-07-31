import { NextRequest, NextResponse } from "next/server";
import { isValidSession, sessionCookieName } from "@/lib/auth";

// Everything is behind the passcode except the login screen itself. Patient
// records must never be reachable from a bare URL. (This is the file Next 16
// calls "proxy"; it used to be "middleware" — same job, same Edge runtime.)
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Public surfaces. The patient view (/p/*) carries its own signed token in
  // the path and the welcome/login screens are pre-auth, so none of these may
  // be forced through the clinic passcode. Everything else is gated below.
  if (
    pathname === "/login" ||
    pathname.startsWith("/welcome") ||
    pathname.startsWith("/p/")
  ) {
    return NextResponse.next();
  }

  const ok = await isValidSession(req.cookies.get(sessionCookieName)?.value);
  if (ok) return NextResponse.next();

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
