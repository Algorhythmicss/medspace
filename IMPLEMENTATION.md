# Live clinic implementation worklog

## Source and workspace

- Active branch: `feat/live-clinic-flow`.
- Active worktree: `/Users/mac/Medspace/work/live-clinic-20261103`.
- Starting source: `554e151` on top of local hardening/reconciliation `1af67e7`. Live previously verified source is `33fdeb0`; later hardening and new work are not yet deployed.
- Preserve `/Users/mac/Medspace/medspace` (dirty original/demo) and the shared release checkout. Product context/decisions are in the original checkout's `docs/PRODUCT_CONTEXT.md`, `PRODUCT.md`, `WORKFLOWS.md`, `DECISIONS.md`, `OPEN_QUESTIONS.md`; those docs are not all versioned in the release source.
- User explicitly requests independent completion while sleeping; no more optional questions needed. Full access does not revoke the explicit no-spend/defer-scanner decision.

## Requirements

See `docs/LIVE_CLINIC.md`. Implement original clinic app, not a replacement demo: transactional live queue, staff check-in, patient own queue/number/conservative ETA, doctor average/pause controls; assigned follow-up photos; short clinician-recorded audio preview/share; minimal UI; three simultaneous role sessions and adversarial checks.

## Work completed before this branch

- Scanner deferral recorded in `docs/FUTURE_WORK.md`, scanner/operations plans and HANDOFF, and mirrored into original product/decision/workflow docs. No scanner or paid service provisioned.
- Small doctor waiting-list assessment-count/anchor improvement committed in `554e151`; five source/test files changed. TypeScript and focused ESLint passed. Extended `scripts/test-assessment-flow.ts` has three new queue visibility/navigation/review checks; it has not yet run.
- Independent preview `/Users/mac/Medspace/tmp/doctor-intake-20261103/app` has an offline dependency install and completed a webpack production build. Default Turbopack was blocked by sandbox IPC; do not call the webpack result a Turbopack pass. The old preview port 3002 is untouched.
- Helper `/Users/mac/Medspace/tmp/doctor-intake-20261103/local.mjs` can serve/test that earlier preview on 3006 or disabled on 3007. `.env.local-test` there contains ONLY local disposable database/fresh synthetic credentials. Existing local Docker `medspace-demo-db` exposes 127.0.0.1:5434; its `medspace_assessment_test` database is used by the old preview/tests, so do not wipe it. For the new feature create a different local database, `medspace_live_clinic_test`.

## Implementation sequence

1. Inspect current source; install cached dependencies in this worktree; add pure queue/time/validation models and additive private schema.
2. Implement locked, idempotent queue operations and strictly filtered doctor/staff/patient snapshot APIs; integrate legacy check-in/visit completion safely behind a feature flag.
3. Add minimal live role components with visibility-aware polling, clear stale/retry state, average/pause controls and patient ETA.
4. Add assigned still-photo requests/uploads/review and short recorded audio/share/private playback, with bounded parser workers and role/ownership checks.
5. Run pure/security/real disposable-Postgres checks, production build and package tracing, then simultaneous three-context browser journey and phone/negative cases. Inspect screenshots.
6. Publish and verify only after exact artifact/schema acceptance. Use the existing approved synthetic hosted project/database for hosted checks; no new paid target. Verify production metadata before applying exact additive schema and releasing. Preserve scanner quarantine and explicit proof boundaries.

## Known environment/tool facts

- No subagents have been spawned; developer permits them only if user or applicable skill/AGENTS explicitly asks for agent delegation.
- Memory registry path `/Users/mac/.codex/memories/MEMORY.md` was absent on this turn; no memory update made.
- Installed Next.js docs live in `node_modules/next/dist/docs/`; read relevant guides before changes. Next 16 gate is `src/proxy.ts`.
- Relevant skills already read: React best-practices and Vercel verification in this turn; Universal Debugger, Supabase and Vercel CLI/deployment/env skills earlier in thread. Use full invariant/ownership/concurrency verification for this feature.
- Approved terminal network prefixes from prior work include the Vercel CLI API/log commands under `/Users/mac/Medspace/tmp/assessment-tools`, `gh api`, `git push origin`, and the follow-up `infra.mjs` helper. All secrets stay out of logs/tool output.
- Existing Vercel auth file: `/Users/mac/Library/Application Support/com.vercel.cli/auth.json` (never print values). Original project `prj_Onb1lZq2ooHK61jUCs5Le4uqrPUL`, team `team_S0YB8RxcpPfM0jAPH6l3McvY`, public alias `medspace-nu.vercel.app`. Synthetic project `prj_9jNeCYwKJQMkcX9NeJ5NVs4rhGdx`, database `medspace_assessment_hosted_test`, credentials at `/Users/mac/Medspace/tmp/assessment-followup-20261102/.env.hosted-synthetic`. Its prior bypass was revoked; create only a temporary test-project bypass if needed and revoke it after tests.

## Current progress

- Implemented the live queue, role-filtered snapshots, atomic/idempotent commands, average/pause controls, explicit consultation lifecycle, vitals conflict checks and midnight handover.
- Added assigned rewritten progress photos and explicit doctor audio record/preview/share/private playback. Added queue-only QR handoff, with a distinct expiring credential that cannot open clinical care.
- Dedicated local DB `medspace_live_clinic_test` is migrated; the approved hosted synthetic DB is additively migrated to 25 deny-all-RLS app tables. Production remains at its previous 20-table schema and old release until acceptance completes.
- Latest core result before queue-token extension: 24 checks passed. Pure regressions: 14 suites passed. Existing DB regressions: 6 suites passed. Latest complete browser run before queue-only handoff: 19 checks passed across three simultaneous contexts with zero uncaught page errors. Audio input is synthetic Web Audio, not physical microphone validation.
- Next: finish the expanded browser/token/lifecycle tests, verify package traces and final build, review phone screenshots, commit/push feature branch, accept exact hosted synthetic artifact, then additively migrate and release original project with source/alias verification.

## Local acceptance complete

- Final source build passes Turbopack/TypeScript. Live core: 28 checks; three-role production-browser journey: 26 checks with zero page errors; existing regressions 212 pure + 72 DB + 17 assessment DB + 29 legacy browser; seed parity 15; package traces 14 controls. See the dated verification document.
- Vercel CLI refreshed its expiring token via `whoami`; original-project readback works. Staff login and all required production environment keys are present (values were not fetched). Original live deployment is still `dpl_2AEY3XgxvCeo2htyZUo4xFZeyELE` at `33fdeb0`, unchanged so far.
- Next: commit/push the feature branch, deploy the protected existing synthetic project, run the same 26-check journey there, revoke the bypass, then migrate/enable/publish original project and verify final Git/deployment/alias/logs.
