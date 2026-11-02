# Patient assessment verification — 2 November 2026

## Status and scope

**Locally implemented and verified; production migration confirmation pending.** No feature commit, GitHub push, original-app deployment or production feature enablement has occurred. The code belongs to the original patient care plan (`/p/<token>` and `/plan`) and doctor chart, not the synthetic `/demo` application.

The original checkout contains unrelated, pre-existing dirty demo/documentation work. A detached release worktree was assembled at `/Users/mac/Medspace/tmp/patient-assessment-release-20261102` from `46f75892a769ca8024e757cebe055365c4c5b77f`, preserving the already deployed white background and privacy-filtered analytics. No demo routes/libraries or demo project settings are included in that release candidate. No new Git branch was created. The original `.vercel/project.json` remains linked to the separate demo project and must not be used for a real-app deployment.

The local preview is an original-app production build on loopback port 3002, backed only by `medspace_assessment_test` on loopback port 5434. Its clinic/patient are explicitly synthetic. A one-day synthetic care link and local-only doctor passcode are recorded outside the repository in the evidence bundle. Native Safari visibly exposes all three question fields, file input, limits and consent. Do not enter real patient data into this local preview.

## Artifact

- Local production build ID: `JZiNnAK5cZ_ImguwSLX_r`.
- Build command: `pnpm run build` (default Turbopack), including Prisma generation and TypeScript checks.
- Next.js `16.4.3`, Sharp `0.35.5`, Prisma client/adapter/CLI `7.10.1`, file-type `22.3.0`.
- Node `24.14.0`, pnpm `10.33.0`, macOS arm64. Hosted Linux behavior is not established by a macOS build.
- Actual local private antivirus: official ClamAV container, loopback only, `1.5.4/28171`, with clean-text and standard EICAR positive controls. It is not a production scanner service.
- Evidence directory: `/Users/mac/Medspace/tmp/patient-assessment-20261102`. The release manifest records file hashes and the build identity; browser screenshots/results, bounded startup/runtime logs, audit JSON and test logs are retained there. Synthetic token/passcode receipts are not committed.

## Verification results

| Check | Result |
| --- | --- |
| `scripts/test-assessment.ts` | 22 passed: validation, multipart/body limits, credentials/origin, malicious filenames, real signatures, spoofed/corrupt/animated/pixel-bomb images, metadata/polyglot rewriting, advertised document families, scanner failures/TLS requirement, real ClamAV controls |
| `scripts/test-assessment-db.ts` | 13 passed: RLS/grants, concurrent idempotency/quotas, revocation, rollback, byte storage limits, database constraints, infected-verdict precedence, merge preservation/key collisions/budgets, and a forced upload/merge race |
| `scripts/test-assessment-flow.ts` | 26 passed through the actual local production server and fresh Chromium: upload/retry/ownership, private downloads/quarantine, mobile form and persistence, Hindi prompts, patient cookie flow, doctor review, valid action replay controls, quota/revocation and bounded browser/network checks |
| `scripts/test-assessment-scanner-flow.ts` | 2 passed through a second packaged server using real local ClamAV: clean document download and whole-submission EICAR rejection without storing the accompanying clean image/answers |
| `scripts/test-assessment-package.ts` | 2 passed: reconstruct only traced dependencies in a temporary directory and run image/document workers; removing the copied native decoder must make the oracle fail |
| Disabled-feature HTTP/page checks | 3 passed: no write, file API 404, assessment UI absent from patient/doctor pages |
| Total assessment checks | **68 passed**; this count excludes the additional legacy regression suites |
| Existing regressions | Patient-link script preserved unchanged; patient-link, phone, reach, revocation, phase-one, onboarding and merge suites passed. Existing analytics checks passed; assessment URLs and record-specific paths are excluded. |
| Focused ESLint and TypeScript | Passed; default production build passed |
| Production dependency audit of candidate | Zero reported critical, high, moderate or low advisories at this checkpoint. This is not a security certification or an audit of the currently deployed artifact. |

Browser results report zero page errors and zero external requests within the bounded run. Patient text resembling script markup remains text, not executed code; the 390px patient viewport has no horizontal overflow. Screenshots cover the patient mobile receipt and doctor chart. Physical phones, physical iOS Safari upload behavior and clinician acceptance were not tested.

## Defects caught before release

Full-checkout tests originally missed worker packaging gaps. The route trace needed file-type transitive dependencies, Sharp dependency links and platform-specific native binaries/libvips. The trace-only test failed against the incomplete artifact and now passes; its omitted-decoder mutation is rejected. A separate download CSP integration test caught the global Next.js header rule overriding the route's sandbox policy; the specific final header rule is verified through HTTP.

The rescan transition now ensures that an infected receipt wins over a concurrent or delayed clean receipt. Patient merging now transfers the new child records, resolves colliding receipt keys, conserves active request budgets and locks patients in stable order against uploads. The forced-overlap test observes the merge blocked by the actual writer backend, releases that writer, then verifies its assessment/file survive under the keeper. Attachment intake remains blocked above the stored-byte allowance while answers without attachments remain possible, including after a large merge.

Doctor action tests wait for the reviewed UI and persistent database state rather than treating an open streamed response as a failed save. Public-route replay checks include an authorized positive control using the same captured action; anonymous/staff/renamed staff credentials cannot mutate the pending record. Framework-forwarded denials can be an empty JSON response, so HTTP status alone is not treated as the authorization oracle.

## Original production migration checkpoint

The original Vercel project is `medspace`, ID `prj_Onb1lZq2ooHK61jUCs5Le4uqrPUL`, Git-linked to `Algorhythmicss/medspace`. Its observed production deployment remains `dpl_57WEYqMZPtTqf2YReXpv7NxuCQAo`; GitHub main remains `46f75892a769ca8024e757cebe055365c4c5b77f`. This feature has not been pushed/deployed. The production database variable is sensitive and was not exported into a local environment file.

Native Safari is signed into the original Supabase project `exzxjsdifcssyvtglhfu` (`medspace`, main production branch). A metadata-only preflight verified the existing Patient columns, no assessment tables, no new migration entry, and the prior ledger through `20260906120000`, `phase_one_documents_and_rx_sets`. After explicit user approval on 2 November 2026, the exact additive assessment migration was applied successfully. Existing clinical records were not read, used as fixtures, seeded, reset or changed.

The reconciled Supabase ledger now contains `20261102100000`, `patient_initial_assessment`, with one 2,889-byte statement and SHA-256 `1f1f9d7c11e53450f2a87e089778e68bce46b0a3b6b3f494084eb5cd668d81f2`, byte-matching the source migration. All three tables have RLS enabled, zero policies, zero PUBLIC/anon/authenticated grants and no effective anon/authenticated table access. Verified check/FK/index counts are InitialAssessment 6/1/3, AssessmentFile 6/1/2 and AssessmentUploadLimit 1/1/1. Detailed constraints include answer bounds, file byte equality, scan state/timestamp consistency and cascading ownership foreign keys. Do not run the whole Prisma migration history against the intentionally divergent production ledger. The merge-aware code requires this schema even if the patient UI is disabled.

At this pre-publication checkpoint, commit/push and hosted feature availability remain pending. Release only the scoped original-app candidate to the original Vercel project, never through the demo link. The planned enabled deployment adds a read-only build gate: `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`. This checks the actual deployment credential against schema metadata without clinical reads or database mutation; it passed against the disposable local database. Do not execute generated diff SQL. A hosted end-to-end suite still needs an explicitly authorized isolated synthetic target; never seed/reset a clinical database or treat real records as synthetic fixtures. A build gate is not authenticated hosted patient/clinician acceptance.

No hosted private ClamAV endpoint is configured. Answers and rewritten photos work without it; supported documents remain stored in inaccessible quarantine until a private scan passes. Provisioning a scanner or sending patient data to a new provider needs a separate explicit infrastructure/privacy decision. No public scanning service, paid scanner or provider migration was introduced.

## Operational incident and cleanup

Vercel CLI `65.9.0` unexpectedly dispatched an attempted `env run ... node` metadata probe into its single-file deploy flow, creating a helper project `check-assessment-backend` and deployment `dpl_9u2LmZVpr8pX7xcLqeLMri3cchSP`. This was disclosed immediately; the exact unintended helper was removed through the Vercel API and the original production deployment/demo link were verified unchanged. The probe contained no embedded production secrets or clinical records and did not read/write a clinical database. Do not repeat that `env run` command. Cleanup receipts are retained; no claim is made about provider-internal retention or billing.

## Rollback and limits

Prefer disabling the feature flag while retaining the schema, uploaded records and merge-aware application code. Do not blindly restore older merge code after assessments exist; it could cascade-delete these new child records during a merge. Retain the preservation fix or block merging in any rollback artifact. No destructive down migration or record reset is authorized.

These checks establish bounded local implementation behavior only. Signatures, image decoders and malware scanners are imperfect; a clean document is still untrusted active content. Worker threads are not OS sandboxes. The singleton clinic is not a multi-clinic tenant design. Existing legacy report/history upload paths are not certified by this suite. Retention/backups, production scanner operation, finalized question wording, hosted integration and real clinician/patient acceptance remain open.
