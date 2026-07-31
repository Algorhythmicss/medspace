import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { ArtBand } from "@/components/Art";
import {
  createSessionValue,
  passcodeMatches,
  sessionCookieName,
  sessionMaxAge,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; e?: string }>;
}) {
  const { next, e } = await searchParams;

  async function signIn(formData: FormData) {
    "use server";
    const code = String(formData.get("passcode") ?? "");
    const target = String(formData.get("next") ?? "") || "/";
    // only allow same-app paths back
    const safeTarget = target.startsWith("/") && !target.startsWith("//") ? target : "/";

    if (!passcodeMatches(code)) {
      redirect(`/login?e=1${next ? `&next=${encodeURIComponent(next)}` : ""}`);
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
        <h1 className="t-title">medSpace</h1>
        <p className="t-body mt-1 text-ink2">Enter the clinic passcode</p>
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
        {e && (
          <p className="text-center text-[13px] font-medium text-coral">
            Wrong passcode. Try again.
          </p>
        )}
        <button
          type="submit"
          className="w-full rounded-2xl bg-peri py-3.5 text-[17px] font-semibold text-white active:opacity-80"
        >
          Unlock
        </button>
      </form>

      <p className="t-micro mt-6 text-center text-ink3">
        Patient records are confidential. Do not share this passcode.
      </p>
    </div>
  );
}
