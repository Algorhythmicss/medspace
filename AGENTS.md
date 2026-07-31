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
- Test suites (reseed after): `npx tsx scripts/test-merge.ts`, `test-report.ts`, `test-supersede.ts`, `test-patient-link.ts`, `test-phone.ts`

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

## Design language — derived from the clinic art library (31 Jul 2026)
The app now shares a world with the ten editorial illustrations in `public/art/`. Every colour below was **sampled from those paintings**, not invented: periwinkle/cornflower walls, warm cream light, sea-glass teal cabinetry, jade planting, small coral and butter accents. Two earlier directions (minimal-white; Headspace navy + hot orange) were rejected — the orange in particular fought the art badly.

**Tokens** (`globals.css`): ground `--cream #faf4ea`; ink is violet-tinged `#2b2a33`, never neutral black; brand `--peri #5b67b0` with hero gradient `--peri-1 #6470c4 → --peri-2 #464f96`; semantics `--coral #c4614a` (alert), `--jade #57795a` (good), `--butter #b3862c` (attention), `--teal #6f9a95`.

**Typography:** Manrope display + system stack (SF Pro on Apple) for text. Use the scale classes `.t-hero .t-title .t-lead .t-head .t-body .t-bodyL .t-cap .t-micro .t-num`, never ad-hoc `text-[Npx]`.

### Using the art — the placement rule
`src/components/Art.tsx` exposes `ArtBand` (shallow crop) and `ArtSpot` (4:3 card) over a named catalogue. **Illustration belongs at moments of pause — signing in, an empty list, a finished task — and never on the working surfaces** (chart, visit form, prescription). A doctor has 2–4 minutes per patient; decoration in that path costs seconds and earns nothing. The palette carries the character everywhere else.

Placed so far: login (`reception`), Today masthead (`huddle`, greeting set *on* the art because the library deliberately leaves painted wall space for headings — this also keeps search near the top for the ≤5s lookup budget), follow-ups empty state (`discharge`), new patient (`reception`).

**Assets:** sources live in `/Users/mac/Medspace/art-src` (not in the repo). Converted with sharp to `public/art/*.webp` at 1400w and `@sm` 720w — **21MB of PNG became 1.1MB**, which matters on a clinic connection. Regenerate with a sharp script if the library changes; never ship the PNGs.

Art direction constraints from the library README worth respecting: 4:3 landscape, keep action in the middle two-thirds on shallow crops, use only a subtle scrim when contrast demands it, and preserve the paper texture — no heavy colour grading.

## Entry points
One deployment, two audiences, three ways in:
- `/welcome` — the public front door: art hero plus "I'm the doctor" / "I'm a patient". Unauthenticated `/` redirects here.
- `/login` — clinic passcode. A deep link into any clinic screen still redirects here with `?next=` and returns afterwards, so only the bare domain gets the chooser.
- `/p/<token>` — the patient's signed link. **This must never route through the chooser**: a patient tapping WhatsApp lands directly on their plan, which is the entire reason the link exists.

`/welcome/patient` explains that the clinic sends a private link (no install, no password — the honest reason there is no patient login yet), accepts a pasted link or bare token via `OpenMyPlan.tsx`, and offers WhatsApp/Call to ask for it again. `Shell.tsx` gives `/welcome*` and `/login` a bare centred column — no clinic chrome.

## Pilot distribution & adoption
Every chart carries a **plan link card** (`SendPlanLink.tsx`) in the desktop rail: "Send on WhatsApp" opens the **doctor's own** WhatsApp via `wa.me` with the message pre-filled, plus a copy button for SMS or reading it out. No Business API, no Meta verification, no DLT registration, no per-message cost — that is deliberately what makes a 100-patient pilot possible without waiting on paperwork.

**Opens are recorded** on `Patient.planFirstOpenedAt / planLastOpenedAt / planOpenCount`, written from the patient page inside Next's `after()` so the patient never waits on a tracking write *and* the write is actually guaranteed to run (a bare floating promise silently never fired). The card shows "Opened" / "Not opened yet". This is the pilot's core metric: the field evidence is that engagement, not messaging, is the binding constraint — SPRINT India saw 17% acknowledge receipt, 99DOTS 33% ever use it. A pilot that can't see opens learns nothing.

## Patient side (`/p/<token>`)
A second app in the same deployment. Reached from a WhatsApp link the doctor sends — the field research was clear that patients will not install a per-clinic app, while 94% of WhatsApp users open it daily. Phone + OTP is a deliberate *later* addition, not a replacement.

**The link is the credential.** `src/lib/patientLink.ts` signs `{patient, expiry, v}` with `MEDSPACE_PATIENT_LINK_SECRET` (Web Crypto HMAC, Edge-safe), 120-day default. Stateless: nothing stored, nothing to clean up. Revoking one patient means rotating the secret — acceptable at this lifetime, and the `v` field is already there for per-patient revocation later. `scripts/test-patient-link.ts` asserts that tampered signatures, re-pointed payloads, garbage and expired links all fail closed.

- `middleware.ts` lets `/p/*` through the clinic passcode; the token is its own auth.
- The page sets `robots: noindex, nofollow, nocache` — a medical record must never reach a search index.
- `Shell.tsx` (client) renders the doctor chrome or a bare patient column depending on the path, so patients never see clinic navigation.
- Links are injected into the follow-up reminder text and the prescription share, so the message a patient receives opens their live plan rather than a static dump.

**Content rules.** Show what helps the patient *act* — medicines, tests still to do, the next visit date, reports on file. Do **not** surface diagnoses, trends or interpretation: the doctor communicates those in person, and a worsening line read cold on a phone is frightening and unsafe. `src/lib/dosage.ts` translates "1-0-1" into "Morning and night" — dosing confusion is a documented adherence cause, and roughly half of Indian chronic patients are non-adherent.

Art is used generously here (consultation hero, lab band, reception footer, prepared-room empty state) because a patient reading at home is not under the doctor's 2–4 minute clock.

**Phone numbers → `src/lib/phone.ts`.** Never build a `wa.me` or `tel:` URL by hand. `waLink()` / `telLink()` return **null** for anything that isn't a real 10-digit Indian mobile, so a bad number yields no button instead of a dead link. This is not theoretical: a clinic phone seeded as `+91 98XXXXXX21` stripped to `919821` and shipped `https://wa.me/91919821` to patients. WhatsApp is the delivery channel for the whole product; a silently broken link there is a silently broken product.

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
