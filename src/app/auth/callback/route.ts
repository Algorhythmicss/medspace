import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { supabaseForAuth } from "@/lib/supabase";
import { readBindToken, createChooserToken } from "@/lib/patientLink";
import { bindIdentity, patientsForIdentity, touchIdentity } from "@/lib/patientAccess";
import { setPatientSession } from "@/lib/session";
import { siteUrl } from "@/lib/siteUrl";

// Where Google returns the patient. Reachable without the clinic passcode by
// necessity (it's in the proxy allow-list), so it trusts nothing in the URL
// except the single-use `code` and validates everything else itself.
export async function GET(req: NextRequest) {
  const jar = await cookies();

  const finish = (path: string, extra: Record<string, string> = {}) => {
    const res = NextResponse.redirect(new URL(path, siteUrl()));
    for (const [k, v] of Object.entries(extra)) res.headers.set(k, v);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  };

  const code = req.nextUrl.searchParams.get("code");
  if (!code) return finish("/welcome/patient?e=nolink");

  const { supabase, authHeaders } = await supabaseForAuth();

  // exchangeCodeForSession takes the bare code; it reads the PKCE verifier that
  // the start action wrote as a cookie, and issues a session we immediately
  // discard — Supabase is only ever asked "who is this Google user".
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data?.session) return finish("/welcome/patient?e=nolink", authHeaders);

  const sub = data.session.user.id; // stable Supabase user id, not email/metadata
  const email = data.session.user.email ?? null;

  // Drop the Supabase session — medSpace's own cookie is the durable credential.
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  for (const c of jar.getAll()) {
    if (c.name.startsWith("sb-")) jar.delete(c.name);
  }

  const bind = await readBindToken(jar.get("medspace_bind")?.value ?? "");
  jar.delete("medspace_bind");

  // First-time bind: the caller held a valid plan link, so they've proved they
  // are this patient — record the (pending) binding and sign them in now. The
  // pending status only gates the *return* path below, where there is no link.
  if (bind) {
    const patient = await db.patient.findUnique({
      where: { id: bind.p },
      select: { id: true, linkVersion: true },
    });
    if (!patient || patient.linkVersion !== bind.v) {
      return finish("/welcome/patient?e=nolink", authHeaders);
    }
    await bindIdentity({ patientId: patient.id, providerUserId: sub, email });
    await setPatientSession(patient.id, patient.linkVersion);
    return finish("/plan?linked=1", authHeaders);
  }

  // Return login: resolve the Google account to its ACTIVE bindings.
  const matches = await patientsForIdentity(sub);
  if (matches.length === 0) return finish("/welcome/patient?e=nolink", authHeaders);
  if (matches.length === 1) {
    await setPatientSession(matches[0].id, matches[0].linkVersion);
    await touchIdentity(sub, matches[0].id);
    return finish("/plan", authHeaders);
  }
  // Several patients on one account → the chooser, carrying a signed list.
  jar.set("medspace_choose", await createChooserToken(matches.map((m) => m.id), sub), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return finish("/welcome/patient/who", authHeaders);
}
