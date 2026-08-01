import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { ArtBand } from "@/components/Art";
import { db } from "@/lib/db";
import {
  createSessionValue,
  hashLoginKey,
  passcodeMatches,
  staffPasscodeMatches,
  sessionCookieName,
  sessionMaxAge,
} from "@/lib/auth";
import { setStaffSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// A short numeric passcode is only safe if guessing is slow. Five wrong tries
// from one client in fifteen minutes and the door stops answering — enough to
// turn a sub-minute brute force into something that would take weeks, while a
// doctor who fat-fingers it a couple of times in the morning never notices.
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; e?: string; desk?: string }>;
}) {
  const { next, e, desk } = await searchParams;
  // Cosmetic only — the passcode itself decides doctor vs front-desk routing.
  const isDesk = desk === "1";

  async function signIn(formData: FormData) {
    "use server";
    const code = String(formData.get("passcode") ?? "");
    const target = String(formData.get("next") ?? "") || "/";
    // only allow same-app paths back (reject //host, /\host open-redirects)
    const safeTarget =
      target.startsWith("/") && !target.startsWith("//") && !target.startsWith("/\\")
        ? target
        : "/";
    const keepNext = next ? `&next=${encodeURIComponent(next)}` : "";

    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const key = await hashLoginKey(ip);
    const since = new Date(Date.now() - WINDOW_MS);

    // The throttle must never wedge the door shut on a DB hiccup — fail open on
    // the counter, but still enforce the passcode itself. Note redirect() throws
    // NEXT_REDIRECT, so the threshold check stays OUT of the try/catch.
    let failures = 0;
    try {
      failures = await db.loginAttempt.count({
        where: { key, failedAt: { gte: since } },
      });
    } catch (err) {
      console.error("login throttle check failed", err);
    }
    if (failures >= MAX_FAILURES) {
      redirect(`/login?e=slow${keepNext}`);
    }

    // One passcode field, two doors: the doctor's, or the front desk's.
    const isDoctor = passcodeMatches(code);
    const isStaff = !isDoctor && staffPasscodeMatches(code);
    if (!isDoctor && !isStaff) {
      try {
        await db.loginAttempt.create({ data: { key } });
      } catch (err) {
        console.error("login attempt record failed", err);
      }
      redirect(`/login?e=1${keepNext}`);
    }

    // Clean slate on success so a legitimate user never inherits a lockout.
    try {
      await db.loginAttempt.deleteMany({ where: { key } });
    } catch {
      // non-fatal — the window entries expire from relevance on their own
    }

    // Staff get the queue and nothing else; the doctor gets everything.
    if (isStaff) {
      await setStaffSession();
      redirect("/queue");
    }

    const jar = await cookies();
    jar.set(sessionCookieName, await createSessionValue(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: sessionMaxAge,
    });
    redirect(safeTarget);
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[380px] flex-col justify-center pb-24">
      <div className="mb-7 overflow-hidden rounded-[26px] shadow-[var(--lift-lg)]">
        <ArtBand name="reception" height="h-[168px]" priority />
      </div>

      <div className="mb-7 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-perisoft text-peri">
          <Lock size={20} strokeWidth={2} />
        </div>
        <h1 className="t-title">{isDesk ? "Reception" : "medSpace"}</h1>
        <p className="t-body mt-1 text-ink2">
          {isDesk ? "Enter your reception passcode" : "Enter the clinic passcode"}
        </p>
      </div>

      <form action={signIn} className="space-y-2.5">
        <input type="hidden" name="next" value={next ?? ""} />
        <input
          name="passcode"
          type="password"
          inputMode="numeric"
          autoFocus
          autoComplete="current-password"
          placeholder="Passcode"
          className="w-full rounded-xl bg-sunk px-4 py-3.5 text-center text-[22px] tracking-[0.3em] outline-none placeholder:text-[17px] placeholder:tracking-normal placeholder:text-ink2"
        />
        {e === "slow" ? (
          <p className="text-center text-[13px] font-medium text-coral">
            Too many attempts. Please wait a few minutes and try again.
          </p>
        ) : e ? (
          <p className="text-center text-[13px] font-medium text-coral">
            Wrong passcode. Try again.
          </p>
        ) : null}
        <button
          type="submit"
          className="w-full rounded-2xl bg-peri py-3.5 text-[17px] font-semibold text-white active:opacity-80"
        >
          Unlock
        </button>
      </form>

      <p className="t-cap mt-5 text-center text-ink3">
        Not the doctor?{" "}
        <a href="/welcome" className="font-semibold text-peri">
          Go back
        </a>
      </p>

      <p className="t-micro mt-4 text-center text-ink3">
        Patient records are confidential. Do not share this passcode.
      </p>
    </div>
  );
}
