import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { ArtBand } from "@/components/Art";
import { db } from "@/lib/db";
import { readChooserToken } from "@/lib/patientLink";
import { patientAgeSex } from "@/lib/format";
import { selectPatientForSession } from "@/app/actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Who is this plan for?",
  robots: { index: false, follow: false },
};

// When one Google account is bound to several patients (a shared family
// account), pick which plan to open. The list is re-derived from OUR signed
// cookie, and the actual open is re-verified server-side in the action — the
// screen shows only first name + age, never a full name or phone.
export default async function ChoosePatient() {
  const jar = await cookies();
  const chooser = await readChooserToken(jar.get("medspace_choose")?.value ?? "");
  if (!chooser) redirect("/welcome/patient");

  const patients = await db.patient.findMany({
    where: { id: { in: chooser.ids } },
    select: { id: true, name: true, dob: true, ageYears: true, sex: true },
  });
  if (patients.length === 0) redirect("/welcome/patient?e=nolink");

  return (
    <div className="py-6">
      <div className="relative mb-6 overflow-hidden rounded-[26px] shadow-[var(--lift-lg)]">
        <ArtBand name="reception" height="h-[160px]" small priority />
        <div className="absolute inset-0 bg-gradient-to-t from-[rgba(70,79,150,0.92)] via-[rgba(70,79,150,0.4)] to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5">
          <h1 className="t-title text-white">Who is this plan for?</h1>
          <p className="t-cap mt-1 text-periink2">Choose whose care plan to open</p>
        </div>
      </div>

      <div className="space-y-3">
        {patients.map((p) => {
          const firstName = p.name.split(" ")[0];
          const meta = patientAgeSex(p);
          return (
            <form key={p.id} action={selectPatientForSession.bind(null, p.id)}>
              <button
                type="submit"
                className="card flex w-full items-center gap-4 p-5 text-left transition-transform active:scale-[0.99]"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-perisoft text-[17px] font-semibold text-peri">
                  {firstName[0]?.toUpperCase() ?? "?"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="t-head block">{firstName}</span>
                  {meta && <span className="t-cap block text-ink3">{meta}</span>}
                </span>
                <ChevronRight size={18} className="shrink-0 text-ink3" />
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}
