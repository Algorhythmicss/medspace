import { saveBaselineHistory } from "@/app/actions";

export default function BaselineHistoryForm({
  patientId,
  existing,
}: {
  patientId: string;
  existing: { conditions: string[]; allergies: string[]; medications: string | null };
}) {
  return (
    <form action={saveBaselineHistory} className="card space-y-4 p-5">
      <input type="hidden" name="patientId" value={patientId} />
      <div>
        <h2 className="t-head">Minimum useful history</h2>
        <p className="t-cap mt-1 text-ink3">Add what changes the next consultation. You can leave everything else for later.</p>
      </div>
      <label className="block">
        <span className="t-cap mb-1.5 block font-semibold text-ink2">Active conditions</span>
        <textarea name="conditions" rows={3} defaultValue={existing.conditions.join("\n")} placeholder="Type 2 diabetes&#10;Hypertension" className="field ring-focus w-full resize-y" />
      </label>
      <label className="block">
        <span className="t-cap mb-1.5 block font-semibold text-ink2">Current medicines</span>
        <textarea name="medications" rows={3} defaultValue={existing.medications ?? ""} placeholder="Metformin 500 mg twice daily" className="field ring-focus w-full resize-y" />
      </label>
      <label className="block">
        <span className="t-cap mb-1.5 block font-semibold text-ink2">Medicine allergies</span>
        <textarea name="allergies" rows={2} defaultValue={existing.allergies.join("\n")} placeholder="Penicillin" className="field ring-focus w-full resize-y" />
      </label>
      <label className="block">
        <span className="t-cap mb-1.5 block font-semibold text-ink2">Useful context</span>
        <textarea name="note" rows={2} placeholder="Last treatment, previous doctor, important event…" className="field ring-focus w-full resize-y" />
      </label>
      <button type="submit" className="btn btn-primary w-full py-3.5">Save history</button>
      <p className="t-micro text-ink3">This is clinician-entered information and is added as verified history immediately.</p>
    </form>
  );
}
