import { NextRequest, NextResponse } from "next/server";
import { isValidSession, sessionCookieName } from "@/lib/auth";

// Everything is behind the passcode except the login screen itself. Patient
// records must never be reachable from a bare URL.
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // The patient view authenticates with its own signed token in the path,
  // so it must not be forced through the clinic passcode.
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/login") ||
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
  // Skip Next internals and static files; guard every real route.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
