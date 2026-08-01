import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// TEMPORARY production diagnostic — remove after debugging the deploy.
// Reports the exact DB error + which host/project the running app connects to,
// with the password masked. No patient data is exposed.
export const dynamic = "force-dynamic";

export async function GET() {
  const raw = process.env.DATABASE_URL || "(unset)";
  const databaseUrl = raw.replace(/:\/\/([^:@/]+):([^@]+)@/, "://$1:***@");

  const out: Record<string, unknown> = {
    nodeEnv: process.env.NODE_ENV,
    databaseUrl,
    env: {
      SESSION_SECRET: !!process.env.MEDSPACE_SESSION_SECRET,
      PATIENT_LINK_SECRET: !!process.env.MEDSPACE_PATIENT_LINK_SECRET,
      SUPABASE_URL: !!process.env.MEDSPACE_SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY: !!process.env.MEDSPACE_SUPABASE_PUBLISHABLE_KEY,
      SITE_URL: process.env.MEDSPACE_SITE_URL ?? null,
      PASSCODE_LEN: (process.env.MEDSPACE_PASSCODE ?? "").length,
    },
  };

  try {
    out.carePlanTaskCount = await db.carePlanTask.count();
    out.ok = true;
  } catch (e) {
    const err = e as { name?: string; code?: string; message?: string };
    out.ok = false;
    out.error = {
      name: err?.name ?? null,
      code: err?.code ?? null,
      message: String(err?.message ?? e).slice(0, 900),
    };
  }

  return NextResponse.json(out);
}
