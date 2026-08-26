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
      <p className="t-cap text-ink3">Add only what changes the next consultation.</p>
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
      <details className="group rounded-2xl border border-hairline">
        <summary className="pressable flex min-h-12 cursor-pointer list-none items-center justify-between px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="t-cap font-semibold text-ink2">Add useful context</span>
          <span className="t-micro text-ink3 group-open:hidden">Optional</span>
          <span className="t-micro hidden text-peri group-open:inline">Done</span>
        </summary>
        <label className="block border-t border-hairline p-3">
          <span className="sr-only">Useful context</span>
          <textarea name="note" rows={2} placeholder="Last treatment, previous doctor, important event…" className="field ring-focus w-full resize-y" />
        </label>
      </details>
      <button type="submit" className="btn btn-primary w-full py-3.5">Save history</button>
      <p className="t-micro text-center text-ink3">Saved directly to the clinician-verified chart.</p>
    </form>
  );
}
