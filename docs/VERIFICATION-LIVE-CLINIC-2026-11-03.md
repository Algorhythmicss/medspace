# Live clinic verification — 3 November 2026

Scope and product decisions: [LIVE_CLINIC.md](LIVE_CLINIC.md). This record distinguishes code checks, disposable database integration, real browser execution, hosted synthetic acceptance and production publication. None establishes clinical validity, actual ETA accuracy, physical-device acceptance or clinician approval.

## Local acceptance

- Next.js 16.4.3 production build with Turbopack and TypeScript: passed. Earlier candidates passed the complete versioned release runner locally, including pre-build security/schema gates and all seven post-build package traces. After Docker Desktop’s engine became unavailable, the final source was built locally with `pnpm run build` and accepted through the complete Linux hosted release runner; a refused local database connection was not counted as a pass. `node scripts/build-release.mjs` fits Vercel’s 256-character project setting limit; its manifest order and stop-on-failure behavior are checked by counterfactual controls.
- Full repository ESLint and focused TypeScript checks: passed.
- 28 real-Postgres live-clinic checks: Indian midnight, conservative ETA/overrun/pause, idempotent registration/check-in, single doctor slot, stale/role restrictions, link revocation, queue-only credential separation/expiry, atomic rollback, legacy arrival adoption, database uniqueness, parsed audio bounds, doctor-only follow-up photo assignment and media-preserving merges with the live flag both on and off.
- 26 simultaneous doctor/staff/patient HTTP/browser checks: real Chrome production app, three isolated contexts open together; queue QR handoff, name/phone registration, conflicting vital edits, call/start/completion, offline ETA withdrawal/recovery, microphone denial/cancel, MediaRecorder preview/discard/share, actual patient playback, live prescription and intake refresh, rewritten private photos, review/closure, spoof/size/quota/ownership rejection, lost successful response and safe retry, three phone layouts and access revocation. Zero uncaught page errors in the accepted run. Audio input is a synthetic Web Audio tone; no person is recorded.
- Existing regressions: 213 checks across 14 focused suites; 72 checks across six existing database suites; 17 assessment database checks; 29 assessment HTTP/browser checks with the live flag disabled. `scripts/test-patient-link.ts` is unchanged.
- Seven trace-only packages passed two controls each: assessment, report, patient page, report page, staff page, progress photos and audio. The oracle deliberately removes the native decoder/parser to prove omitted dependencies are detected. The package runs without the checkout's dependency tree.
- Read-only schema gates passed for the existing three assessment tables and five new live-clinic tables, including RLS, zero policies/public grants, foreign keys, checks, queue uniqueness and required columns.
- Both demo seed implementations passed 15 parity checks in a separately created disposable local database. That database was removed after the run. No production seed/reset command ran.
- Production dependency audit reported zero known advisories at the time of the check.

Local receipts/screenshots are under `/Users/mac/Medspace/tmp/live-clinic-20261103/`. Clinical test fixtures are removed after each accepted integration/browser run; the final local readback found zero patients, media, assessments and formulary entries. Disposable local command receipts/day counters remain as test evidence. The old unrelated checkout and preview are preserved.

## Final hosted acceptance

Application source `216b17364646ddeda01dc4444b872df41ffb248e` (source tree `52304ba792f2732c60e64e8711e726573d0d8875`) passed all versioned Linux release gates on isolated deployment `dpl_AxqsFvDDTy8qTGsa2idrMPzQfaTv`. Its 27-check simultaneous browser journey passed on 3 November 2026, 14:15–14:21 UTC, with zero uncaught page errors. The separate 29-check integration run passed on the approved isolated PostgreSQL target. These runs include short historical patient/queue/follow-up IDs and deny reception access to doctor care or historical queue edits.

The deployed audio boundary exposed an import-only package-resolution difference. Resolving the pinned import entry directly fixed it. Two added runtime controls reproduce the unavailable synchronous export and prove that the actual browser fixture still validates with synchronous ESM resolution disabled; the trace-only audio worker runs under that constraint too. Actual authenticated hosted record/preview/share/playback passed after the fix.

The generated test deployment is protected by Vercel sign-in. Its production alias has a public landing page and independently enforces application authentication (401 on private queue reads). All synthetic patients/media/assessments/clinic/command receipts/day counters were removed. Temporary protection bypasses and the test-only diagnostic setting were removed. No paid protection feature was provisioned. Bounded runtime/error and HTTP 5xx queries for the accepted deployment returned no records.

## Production schema and publication contract

The original Supabase project received the byte-identical additive SQL before publication. Ledger version `20261103134707`, name `live_clinic_flow`, has one statement equal to the committed migration (SHA-256 `274aa7482217cd5c7fbc9e2e1839c713adffc17c130106caff9f9941fcb59018`). All five new tables have RLS, zero policies, zero public/client grants/effective access, the expected constraints/indexes, and the three queue uniqueness invariants. Existing patient/visit/report/original queue-field digests match before and after; no clinical fixture was created in production.

Metadata confirmed that existing record IDs include the older bounded ASCII form. The implementation supports them without rewriting records. All existing IDs match the accepted shape. The deny-all policy advisory is intentional; the separate existing Supabase password-protection advisory was not changed by this feature.

The original Vercel project uses `node scripts/build-release.mjs`, main-only Git deployment rules and `MEDSPACE_LIVE_CLINIC_ENABLED=true` for production. Scanner hosting remains unconfigured. The release helper rejects any application/configuration change after the accepted source; only documentation may differ. Final Git SHA, deployment, alias, public security/browser checks and bounded logs are recorded in `/Users/mac/Medspace/tmp/live-clinic-20261103/production-status.json` and adjacent public-release/log receipts. Check those platform markers rather than equating a local build or Git push with publication.

## Remaining external acceptance

Physical microphone/OS permissions, Safari/iOS behavior on a real device, actual clinic comprehension, pessimistic ETA calibration, printer output, retention/export policy and clinician acceptance require a pilot. Hosted malware scanning remains deferred by the founder's no-spend decision; documents remain quarantined. No paid service or scanner infrastructure was provisioned.
