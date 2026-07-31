// The app's own absolute origin. Read at request time (never at module load),
// so a build with no env still succeeds — same discipline as db.ts.
//
// Used for the Google redirect target, which MUST be deterministic: Supabase
// matches it against an exact allow-list, and building it from the request's
// Host header instead would be reset-link poisoning applied to a URL that
// carries a credential.
export function siteUrl(): string {
  const s = process.env.MEDSPACE_SITE_URL;
  if (!s) throw new Error("MEDSPACE_SITE_URL is not set");
  return s.replace(/\/$/, "");
}
