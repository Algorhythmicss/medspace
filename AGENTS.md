<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# medSpace — memory-first clinic OS

Doctor-side app for Indian private OPD. Enter as a faster EMR, retain via accumulated patient memory. Strategy and field research: `../research/virtual-observation-day.md`.

Named **medSpace**. It was briefly "Kyra" — that is a *different product* of the user's; never reintroduce the name.

## Time budgets (the spec — regressions here are bugs)
- Patient lookup → chart ≤5s (name / phone / fileNumber)
- Memory card ≤5 lines, absorbable in a 10s glance
- Repeat Rx ≤30s (one tap + save); new Rx ≤90s
- Zero training; phone-first (375px); assume no receptionist and no reliable internet

## Stack
Next.js 15 (App Router, `src/`), Tailwind v4, Prisma 7 with the **Postgres** driver adapter (`@prisma/adapter-pg`). Client is generated to `src/generated/prisma` — import from `@/generated/prisma/client`. `src/generated/` is not deployed, so `build` and `postinstall` both run `prisma generate`.

`src/lib/db.ts` constructs the client **lazily behind a Proxy**: a build with no `DATABASE_URL` must succeed (verified), otherwise Vercel can't build before env vars exist.

## Commands
- `pnpm dev` — dev server (or `preview_start` with launch config `medspace-dev`)
- `npx prisma migrate deploy` — apply migrations · `npx tsx prisma/seed.ts` — reseed the demo panel
- `npx tsc --noEmit` — typecheck · `npx next build` — production build
- Test suites (reseed after): `npx tsx scripts/test-merge.ts`, `test-report.ts`, `test-supersede.ts`

## Databases
**Local dev = Postgres in Docker. Never point local tooling at production.**

```bash
docker run -d --name medspace-pg -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=medspace -p 5433:5432 postgres:17
```

`.env` and `.env.local` both hold the container URL. **Never put the production `DATABASE_URL` in either file** — the prisma CLI reads `.env` and `prisma/seed.ts` deletes every row before seeding, so a production URL there would destroy live patient records. Production values live only in Vercel's env settings; do production schema/data work through the Supabase MCP (`apply_migration`, `execute_sql`).

**Production:** Supabase project `medspace`, ref `exzxjsdifcssyvtglhfu`, ap-south-1 (Mumbai). Schema already applied. Vercel team `team_S0YB8RxcpPfM0jAPH6l3McvY`. Required env vars (`.env.example`): `DATABASE_URL` (pooled, port 6543), `MEDSPACE_PASSCODE`, `MEDSPACE_SESSION_SECRET`.

`scripts/seed-sql.ts` emits the whole demo panel as SQL (deterministic ids, wipes first) for loading a remote DB via `execute_sql` without a local connection string.

**RLS is deny-all (applied 31 Jul 2026).** All 11 tables have RLS enabled with **no policies**, deliberately: medSpace connects as the `postgres` role via Prisma (which bypasses RLS), while anon/authenticated PostgREST roles are denied outright, so the project's publishable key cannot read patient rows. `get_advisors` now reports only the INFO-level "RLS enabled, no policy" note — that is the intended state, not a defect. Do **not** "fix" it by adding permissive policies.

**Repo:** https://github.com/Algorhythmicss/medspace (private). Vercel should be connected to this repo so pushes auto-deploy.

## Auth
Passcode gate: signed 12h session cookie (Web Crypto HMAC, Edge-compatible — `src/lib/auth.ts`), enforced by `src/middleware.ts` on every route except `/login`. Verified: all routes including `/api/search` and `/api/reports/[id]/file` return 307→/login without a session.

## Architecture notes
- `src/lib/memory.ts` — the memory card. Deterministic rules, no LLM: trends (per-metric clinical `minDelta`, latest vs previous **and** vs oldest-in-window so slow drift is caught), overdue-task gaps, reports newer than the last visit, last visit. Capped at 5 lines by design — the craft is deletion, not display.
- `src/app/actions.ts` — all server actions. `createVisit` also creates FOLLOW_UP/LAB_TEST tasks, auto-closes prior pending follow-ups (the patient showed up), supersedes overlapping stale lab orders, and bumps `Drug.useCount` so autosuggest learns the doctor's habits.
- `src/lib/tasks.ts` — supersedure + `completeMatchingLabTasks` (an arriving lab value closes the order that asked for it, matched via aliases in `src/lib/metrics.ts`).
- `src/lib/merge.ts` — duplicate-record merge in a transaction; dedupes conditions/allergies case-insensitively, backfills only blank keeper fields, never overwrites the keeper. No un-merge; the confirm screen says so.
- Report attachments are stored **in Postgres** (`Report.fileData`, 4MB cap) and served by `/api/reports/[id]/file` behind the auth gate — serverless has no persistent filesystem, and this keeps files off public URLs. Never `select` `fileData` in list/chart queries; both call sites use explicit `select`.
- Offline: `VisitForm` autosaves to `localStorage` (`medspace:visit-draft:<patientId>`, 300ms debounce), restores on mount with a "Start fresh" escape, drops the draft on submit and **writes it back if the save throws**. A `NEXT_REDIRECT` digest must be rethrown, not treated as failure — otherwise every successful save looks like an error.
- WhatsApp is always a `wa.me` deep link with prefilled text. The doctor presses send. Never auto-send.
- Printed Rx carries the doctor's registration number (legally required, Telemedicine Practice Guidelines 2020) and a QR encoding `/scan/<fileNumber>` for instant lookup at the next visit.

## Design language — warm clinical calm (redesigned 31 Jul 2026)
Reference points: Headspace (warmth, generous spacing), Apple (hierarchy, restraint), Notion (quiet content-first chrome), Figma (precision in dense numerics).

Tokens live in `globals.css` as CSS variables surfaced through `@theme inline`:
- **Ground** warm paper `#f7f6f3`, surfaces white, sunk fills `#f1efea`. Never cold system gray.
- **Ink** warm neutrals `#1c1b18 / #6b675e / #9c978c`. Never pure black.
- **Brand** deep teal `#0e6b5e` — health without sterile blue; `primarysoft` for tints.
- **Semantics** muted and serious: alert `#b3261e`, warn `#9a5b06`, good `#2e6b45`, each with a soft tint.
- **Depth** two soft shadow layers (`--lift`, `--lift-lg`), no hard borders. Hairline separators via `.rows`.
- **Type** `Plus_Jakarta_Sans` (display, headings and patient names) + `Inter` (body/data), self-hosted by next/font so a clinic's bad connection never blocks text. `.tnum` for tabular figures on every clinical value.
- **Helpers** `.card`, `.card-lg`, `.rows`, `.field`, `.btn`, `.chip`, `.label`, `.rise`.

Rules that carry the intent — break these and it drifts back to a generic CRUD app:
- **Sentence-case labels only.** All-caps headings shout; six of them was most of why the old chart felt busy.
- **Hierarchy over colour.** The lead finding is large in *ink* with a coloured rail. Do not also colour the sentence — size + colour + rail is triple encoding and reads as panic.
- **Never say the same thing twice.** The briefing summarises overdue work ("2 things overdue, oldest by 35 days"); the Open items list carries the titles.
- **One accent.** Teal is the only brand colour; secondary selections use warm gray `ink2`, not a second bright hue.
- Trends read as arrows (`1.10 → 1.40 mg/dL, 9mo`), not prose — fewer wraps on a phone.

## Traps that cost time before
- **Silent server-action failure:** a dynamic `await import()` inside `actions.ts` pulled `node:fs` into the client graph and broke *every* server action with no error anywhere — forms just no-op'd. Keep imports in `actions.ts` static and top-level. Turbopack also serves a poisoned graph long after the source is fixed: `rm -rf .next` and restart. Tell-tale sign is dev-server logs citing imports that no longer exist.
- **Client/server boundary:** client components must not import `db.ts`, `reports.ts`, `tasks.ts`, or `merge.ts`. Shared constants belong in `src/lib/metrics.ts`.
- **NULL-safe Prisma filters:** `{ visitId: { not: x } }` silently drops rows where `visitId IS NULL`; use an explicit `OR: [{ visitId: null }, ...]`.
- **Shell cwd:** the harness resets Bash cwd to `/Users/mac/Medspace.` (a stray dot-suffixed directory). Always `cd /Users/mac/Medspace/medspace &&` first, or installs land in the user's home `package.json`.
- **Browser screenshots are 2× scale:** a row at screenshot y=358 is CSS y=179. Prefer clicking `read_page` refs.

## Iteration backlog
- **Wipe the demo panel before real patients.** Production currently holds the 8 fictional demo patients. Clear with the DELETE block at the top of `scripts/seed-sql.ts` before the clinic enters anyone real.
- Vercel: connect the GitHub repo and set `DATABASE_URL` / `MEDSPACE_PASSCODE` / `MEDSPACE_SESSION_SECRET` in the dashboard (no MCP tool exists for env vars).
- Offline *reads*: drafts survive a dropped connection but charts still need the server. Cloud hosting is now the chosen path, so this means a service worker + local cache + sync queue — a substantial build. Don't start it speculatively.
- OCR/AI parsing of report photos to prefill key values (needs an API-key decision; manual entry works today).
- Draft recovery covers only the visit form, not the report form or demographics edit.
- Verify A5 print output on a real printer during the pilot.
