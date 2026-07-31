import Image from "next/image";

// The clinic art library.
//
// Placement rule: illustration appears at moments of *pause* — signing in,
// an empty list, a finished task — and never on the working surfaces (chart,
// visit form, prescription). A doctor has two to four minutes per patient;
// decoration in that path costs seconds and earns nothing. The art carries
// the product's character; the palette carries it everywhere else.

export const ART = {
  huddle: "care-team-huddle",
  consultation: "patient-consultation",
  handoff: "bedside-handoff",
  reception: "reception-checkin",
  imaging: "imaging-review",
  lab: "lab-processing",
  theatre: "operating-room-readiness",
  medication: "medication-review",
  discharge: "discharge-support",
  room: "prepared-patient-room",
} as const;

export type ArtName = keyof typeof ART;

/**
 * A shallow, wide crop. The library is 4:3 with the action in the middle
 * two-thirds, so a shallow band keeps people in frame while leaving the
 * painted wall space the illustrator left for headings.
 */
export function ArtBand({
  name,
  className = "",
  priority = false,
  height = "h-[132px]",
  small = false,
}: {
  name: ArtName;
  className?: string;
  priority?: boolean;
  height?: string;
  small?: boolean;
}) {
  return (
    <div className={`relative w-full overflow-hidden ${height} ${className}`}>
      <Image
        src={`/art/${ART[name]}${small ? "@sm" : ""}.webp`}
        alt=""
        aria-hidden
        fill
        sizes={small ? "720px" : "(min-width: 1024px) 1080px, 100vw"}
        className="object-cover object-center"
        priority={priority}
      />
    </div>
  );
}

/** Full illustration for empty states — sits above a short line of copy. */
export function ArtSpot({
  name,
  className = "",
}: {
  name: ArtName;
  className?: string;
}) {
  return (
    <div className={`relative mx-auto aspect-[4/3] w-full max-w-[320px] overflow-hidden rounded-2xl ${className}`}>
      <Image
        src={`/art/${ART[name]}@sm.webp`}
        alt=""
        aria-hidden
        fill
        sizes="320px"
        className="object-cover"
      />
    </div>
  );
}
