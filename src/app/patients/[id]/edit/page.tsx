import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { updatePatient } from "@/app/actions";

export const dynamic = "force-dynamic";

const fieldCls =
  "w-full rounded-xl bg-sunk px-3.5 py-3 text-[17px] outline-none placeholder:text-ink2";

export default async function EditPatient({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patient = await db.patient.findUnique({ where: { id } });
  if (!patient) notFound();

  // Another record on the same phone almost always means one person split
  // across two memories — surface it rather than silently allowing the drift.
  const phoneTwin = patient.phone
    ? await db.patient.findFirst({
        where: { phone: patient.phone, id: { not: patient.id } },
        select: { id: true, name: true, fileNumber: true },
      })
    : null;

  return (
    <div className="px-4 pt-3">
      <header className="mb-4 flex items-center gap-1">
        <Link
          href={`/patients/${patient.id}`}
          className="-ml-2 p-1.5 text-orange active:opacity-60"
        >
          <ChevronLeft size={26} />
        </Link>
        <div>
          <h1 className="text-[22px] font-bold leading-tight tracking-tight">Edit details</h1>
          <p className="text-[13px] text-ink2">#{patient.fileNumber}</p>
        </div>
      </header>

      {phoneTwin && (
        <div className="mb-3 rounded-2xl bg-sunnysoft px-4 py-3">
          <p className="text-[13px] font-semibold text-sunny">Same phone as another record</p>
          <p className="text-[13px] text-ink2">
            {phoneTwin.name} · #{phoneTwin.fileNumber}
          </p>
          <div className="mt-2 flex gap-2">
            <Link
              href={`/patients/${phoneTwin.id}`}
              className="flex-1 rounded-xl bg-surface py-2 text-center text-[13px] font-semibold active:opacity-70"
            >
              Open it
            </Link>
            <Link
              href={`/patients/${patient.id}/merge?with=${phoneTwin.id}`}
              className="flex-1 rounded-xl bg-sunny py-2 text-center text-[13px] font-semibold text-white active:opacity-80"
            >
              Same person — merge
            </Link>
          </div>
        </div>
      )}

      <form action={updatePatient} className="space-y-2.5">
        <input type="hidden" name="patientId" value={patient.id} />
        <input name="name" required defaultValue={patient.name} placeholder="Full name" className={fieldCls} />
        <input
          name="phone"
          defaultValue={patient.phone ?? ""}
          placeholder="Phone (WhatsApp)"
          inputMode="tel"
          className={fieldCls}
        />
        <div className="grid grid-cols-2 gap-2.5">
          <input
            name="age"
            defaultValue={patient.ageYears ?? ""}
            placeholder="Age"
            inputMode="numeric"
            className={fieldCls}
          />
          <select
            name="sex"
            defaultValue={patient.sex ?? ""}
            className="w-full appearance-none rounded-xl bg-sunk px-3.5 py-3 text-[17px] outline-none"
          >
            <option value="">Sex</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
            <option value="O">Other</option>
          </select>
        </div>
        <input
          name="address"
          defaultValue={patient.address ?? ""}
          placeholder="Address"
          className={fieldCls}
        />
        <input
          name="abhaId"
          defaultValue={patient.abhaId ?? ""}
          placeholder="ABHA number (optional)"
          className={fieldCls}
        />
        <button
          type="submit"
          className="mt-2 w-full rounded-2xl bg-orange py-3.5 text-[17px] font-semibold text-white active:opacity-80"
        >
          Save changes
        </button>
      </form>
    </div>
  );
}
