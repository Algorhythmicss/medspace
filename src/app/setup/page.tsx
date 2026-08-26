import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { updateClinicSettings } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function ClinicSetup() {
  const clinic = await db.clinic.findUnique({ where: { id: "clinic" } });

  return (
    <div className="mx-auto w-full max-w-[560px] pt-3">
      <header className="mb-5 flex items-center gap-1">
        <Link href="/" aria-label="Back" className="-ml-2 p-1.5 text-peri active:opacity-60">
          <ChevronLeft size={26} />
        </Link>
        <div>
          <h1 className="t-title">Clinic setup</h1>
          <p className="t-cap text-ink3">Your prescription identity</p>
        </div>
      </header>

      <form action={updateClinicSettings} className="card space-y-4 p-5">
        <label className="block">
          <span className="t-cap mb-1.5 block font-semibold text-ink2">Clinic name</span>
          <input name="clinicName" required defaultValue={clinic?.clinicName ?? ""} className="field ring-focus w-full" />
        </label>
        <label className="block">
          <span className="t-cap mb-1.5 block font-semibold text-ink2">Doctor name</span>
          <input name="doctorName" required defaultValue={clinic?.doctorName ?? ""} placeholder="Dr. Ananya Sharma" className="field ring-focus w-full" />
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="block">
            <span className="t-cap mb-1.5 block font-semibold text-ink2">Registration no.</span>
            <input name="regNumber" required defaultValue={clinic?.regNumber ?? ""} className="field ring-focus w-full" />
          </label>
          <label className="block">
            <span className="t-cap mb-1.5 block font-semibold text-ink2">Degrees</span>
            <input name="degrees" defaultValue={clinic?.degrees ?? ""} placeholder="MBBS, MD" className="field ring-focus w-full" />
          </label>
        </div>
        <label className="block">
          <span className="t-cap mb-1.5 block font-semibold text-ink2">Clinic phone</span>
          <input name="phone" inputMode="tel" defaultValue={clinic?.phone ?? ""} className="field ring-focus w-full" />
        </label>
        <label className="block">
          <span className="t-cap mb-1.5 block font-semibold text-ink2">Address</span>
          <textarea name="address" rows={3} defaultValue={clinic?.address ?? ""} className="field ring-focus w-full resize-y" />
        </label>
        <button type="submit" className="btn btn-primary w-full py-3.5">Save clinic</button>
        <p className="t-micro text-center text-ink3">Registration number appears on every electronic prescription.</p>
      </form>
    </div>
  );
}
