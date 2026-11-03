# Live clinic verification — 3 November 2026

Scope and product decisions: [LIVE_CLINIC.md](LIVE_CLINIC.md). This record distinguishes code checks, disposable database integration, real browser execution, hosted synthetic acceptance and production publication. None establishes clinical validity, actual ETA accuracy, physical-device acceptance or clinician approval.

## Local acceptance

- Next.js 16.4.3 production build with Turbopack and TypeScript: passed. The complete versioned release runner also passed locally, including pre-build security/schema gates and all seven post-build package traces. `node scripts/build-release.mjs` fits Vercel’s 256-character project setting limit; its manifest order and stop-on-failure behavior are checked by counterfactual controls.
- Full repository ESLint and focused TypeScript checks: passed.
- 28 real-Postgres live-clinic checks: Indian midnight, conservative ETA/overrun/pause, idempotent registration/check-in, single doctor slot, stale/role restrictions, link revocation, queue-only credential separation/expiry, atomic rollback, legacy arrival adoption, database uniqueness, parsed audio bounds, doctor-only follow-up photo assignment and media-preserving merges with the live flag both on and off.
- 26 simultaneous doctor/staff/patient HTTP/browser checks: real Chrome production app, three isolated contexts open together; queue QR handoff, name/phone registration, conflicting vital edits, call/start/completion, offline ETA withdrawal/recovery, microphone denial/cancel, MediaRecorder preview/discard/share, actual patient playback, live prescription and intake refresh, rewritten private photos, review/closure, spoof/size/quota/ownership rejection, lost successful response and safe retry, three phone layouts and access revocation. Zero uncaught page errors in the accepted run. Audio input is a synthetic Web Audio tone; no person is recorded.
- Existing regressions: 213 checks across 14 focused suites; 72 checks across six existing database suites; 17 assessment database checks; 29 assessment HTTP/browser checks with the live flag disabled. `scripts/test-patient-link.ts` is unchanged.
- Seven trace-only packages passed two controls each: assessment, report, patient page, report page, staff page, progress photos and audio. The oracle deliberately removes the native decoder/parser to prove omitted dependencies are detected. The package runs without the checkout's dependency tree.
- Read-only schema gates passed for the existing three assessment tables and five new live-clinic tables, including RLS, zero policies/public grants, foreign keys, checks, queue uniqueness and required columns.
- Both demo seed implementations passed 15 parity checks in a separately created disposable local database. That database was removed after the run. No production seed/reset command ran.
- Production dependency audit reported zero known advisories at the time of the check.

Local receipts/screenshots are under `/Users/mac/Medspace/tmp/live-clinic-20261103/`. Clinical test fixtures are removed after each accepted integration/browser run; the final local readback found zero patients, media, assessments and formulary entries. Disposable local command receipts/day counters remain as test evidence. The old unrelated checkout and preview are preserved.

## Hosted and production gates

Use only the existing approved `medspace-assessment-test` project and isolated `medspace_assessment_hosted_test` database. The new additive migration was applied there first; all 25 app tables have RLS. Before publication, run the full versioned build gates and the simultaneous browser journey against its protected deployment. Revoke the temporary test bypass and remove fixtures afterward.

Production must receive byte-identical additive SQL before this source is enabled. Compare metadata and existing-record digests around that migration. Enable `MEDSPACE_LIVE_CLINIC_ENABLED=true`, preserve the main-only Git deployment rules, verify the final Git SHA/deployment/alias and run public security/browser checks plus bounded error/5xx logs. Never test authenticated writes using production patients.

## Remaining external acceptance

Physical microphone/OS permissions, Safari/iOS behavior on a real device, actual clinic comprehension, pessimistic ETA calibration, printer output, retention/export policy and clinician acceptance require a pilot. Hosted malware scanning remains deferred by the founder's no-spend decision; documents remain quarantined. No paid service or scanner infrastructure was provisioned.
