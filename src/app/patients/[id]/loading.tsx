// Shaped like the chart itself — name + briefing card + plan-link + a couple of
// history rows — so opening a patient reveals the layout instantly and the real
// numbers fill in, instead of a blank wait on the heaviest, most-opened screen.
export default function Loading() {
  return (
    <div className="pt-5 lg:pt-8" aria-busy="true" aria-label="Loading patient">
      <div className="mb-4 flex items-start justify-between">
        <div className="space-y-2">
          <div className="skeleton h-6 w-44 rounded-lg" />
          <div className="skeleton h-3.5 w-56 rounded-md" />
        </div>
        <div className="skeleton h-8 w-20 rounded-full" />
      </div>

      <div className="skeleton h-[268px] w-full rounded-[26px]" />
      <div className="skeleton mt-4 h-28 w-full rounded-[22px]" />

      <div className="mt-6 space-y-3">
        <div className="skeleton h-4 w-24 rounded-md" />
        <div className="skeleton h-20 w-full rounded-[20px]" />
        <div className="skeleton h-20 w-full rounded-[20px]" />
      </div>
    </div>
  );
}
