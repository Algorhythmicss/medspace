// The instant shell. Next paints this the moment you navigate, so a screen
// never freezes on the previous page while its data loads — the shape is there
// at once and real content swaps in when the server responds. Shaped like the
// common "band + search + a few cards" screen, neutral enough to stand in for
// any of them for the fraction of a second it shows.
export default function Loading() {
  return (
    <div className="pt-5 lg:pt-8" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-[156px] w-full rounded-[26px] lg:h-[184px]" />
      <div className="skeleton mt-5 h-[52px] w-full rounded-2xl" />
      <div className="mt-6 space-y-3">
        <div className="skeleton h-4 w-28 rounded-md" />
        <div className="skeleton h-[92px] w-full rounded-[20px]" />
        <div className="skeleton h-[92px] w-full rounded-[20px]" />
        <div className="skeleton h-[92px] w-full rounded-[20px]" />
      </div>
    </div>
  );
}
