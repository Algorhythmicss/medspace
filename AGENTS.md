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
Next.js 16.2 (App Router, `src/`, Turbopack), Tailwind v4, Prisma 7 with the **Postgres** driver adapter (`@prisma/adapter-pg`). Client is generated to `src/generated/prisma` — import from `@/generated/prisma/client`. `src/generated/` is not deployed, so `build` and `postinstall` both run `prisma generate`. The passcode gate lives in `src/proxy.ts` — Next 16 renamed the `middleware` file convention to `proxy` (same Edge runtime, same `export const config`); the export is `export async function proxy`. Don't recreate `src/middleware.ts` or the build hard-errors on having both.

`src/lib/db.ts` constructs the client **lazily behind a Proxy**: a build with no `DATABASE_URL` must succeed (verified), otherwise Vercel can't build before env vars exist.

## Commands
- `pnpm dev` — dev server (or `preview_start` with launch config `medspace-dev`)
- `npx prisma migrate deploy` — apply migrations · `npx tsx prisma/seed.ts` — reseed the demo panel
- `npx tsc --noEmit` — typecheck · `npx next build` — production build
- Test suites (reseed after): `npx tsx scripts/test-merge.ts`, `test-report.ts`, `test-supersede.ts`, `test-patient-link.ts`, `test-phone.ts`, `test-reach.ts`, `test-revocation.ts`, `test-patient-access.ts`

## Databases
**Local dev = Postgres in Docker. Never point local tooling at production.**

```bash
docker run -d --name medspace-pg -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=medspace -p 5433:5432 postgres:17
```

`.env` and `.env.local` both hold the container URL. **Never put the production `DATABASE_URL` in either file** — the prisma CLI reads `.env` and `prisma/seed.ts` deletes every row before seeding, so a production URL there would destroy live patient records. Production values live only in Vercel's env settings; do production schema/data work through the Supabase MCP (`apply_migration`, `execute_sql`).

**Production:** Supabase project `medspace`, ref `exzxjsdifcssyvtglhfu`, ap-south-1 (Mumbai). Schema already applied. Vercel team `team_S0YB8RxcpPfM0jAPH6l3McvY`. Required env vars (`.env.example`): `DATABASE_URL` (pooled, port 6543), `MEDSPACE_PASSCODE`, `MEDSPACE_SESSION_SECRET`.

`scripts/seed-sql.ts` emits the whole demo panel as SQL (deterministic ids, wipes first) for loading a remote DB via `execute_sql` without a local connection string.

**RLS is deny-all.** Every table has RLS enabled with **no policies**, deliberately: medSpace connects as the `postgres` role via Prisma (which bypasses RLS), while anon/authenticated PostgREST roles are denied outright, so the project's publishable key cannot read patient rows. `get_advisors` reports only the INFO-level "RLS enabled, no policy" note — the intended state, not a defect. Do **not** "fix" it by adding permissive policies.

**Every new Prisma table is a security hole until its migration says otherwise.** Prisma creates tables with RLS **off**, and this Supabase project's default privileges grant `anon`/`authenticated` full access on new `public` tables — so a fresh table is world-readable/writable through the publishable key until you enable RLS on it. Every migration that creates a table MUST hand-append `ALTER TABLE "X" ENABLE ROW LEVEL SECURITY;` plus a `REVOKE ALL ... FROM anon, authenticated`. Because local Docker Postgres has no `anon` role, guard the REVOKE in a `DO $$ ... IF EXISTS (SELECT 1 FROM pg_roles ...) $$` block so the identical file runs both places (see `20260731145237_link_version_and_login_throttle`). Apply to prod via the Supabase MCP `apply_migration` with byte-identical SQL, then verify with the `pg_class`/`role_table_grants` query (require `rls=true`, `pol=0`, `grants=none` for the new table). Table count as of 1 Aug 2026: 13 (added `LoginAttempt`, then `PatientAccess` — the latter's RLS is load-bearing, see the Google-auth section).

**Repo:** https://github.com/Algorhythmicss/medspace (private). Vercel should be connected to this repo so pushes auto-deploy.

## Auth & security posture (pilot)
Passcode gate: signed 12h session cookie (Web Crypto HMAC, Edge-compatible — `src/lib/auth.ts`), enforced by `src/proxy.ts`. The public allowlist is exactly `/login`, `/welcome*`, `/p/*`; everything else 307→/login without a session (verified for `/api/search` and `/api/reports/[id]/file`).

The proxy is **defence in depth, not the authorization boundary** — a Server Action is a POST dispatched by action id to whatever route its component lives on, so an exempt route could run it unauthenticated. Therefore:
- **`assertClinicSession()` (`src/lib/session.ts`) is the first line of every doctor-side action** in `actions.ts` (all except `signOut`, which only clears the cookie). Add it to any new action too.
- **`/api/reports/[id]/file` checks the session in the handler** (`hasClinicSession`) and 404s without it — not relying on the proxy alone.
- **Login is throttled**: 5 failed attempts per hashed-IP per 15 min → `?e=slow` and the door stops answering (`login/page.tsx` + `hashLoginKey` in `auth.ts`, backed by the `LoginAttempt` table). The passcode is a short PIN and was brute-forceable in under a minute without this. **The pilot passcode must be 6+ digits in prod** (`MEDSPACE_PASSCODE`).
- **Uploaded files fail closed on MIME**: only `image/jpeg|png|webp|gif` and `application/pdf` are served `inline`; everything else is stored as `application/octet-stream` and served `Content-Disposition: attachment` with `X-Content-Type-Options: nosniff` (`INLINE_SAFE_MIME` in `reports.ts`, enforced on write in `createReport` and on read in the file route). Stops an uploaded SVG/HTML executing on this origin with the doctor's cookie.
- **`next.config.ts`** sets `Referrer-Policy: same-origin` (the patient link is a credential in the URL — never leak it via Referer), `X-Content-Type-Options`, a `frame-ancestors 'none'` CSP, `images.localPatterns` pinned to `/art/**` (so `/_next/image` can't proxy `/api/reports/.../file`), and `Cache-Control: private, no-store` on `/p/:token*`.
- **The proxy matcher excludes by prefix, not extension** — the old `.*\.(png|jpg|…)$` pattern let `/patients/<id>.png` and `/api/reports/<id>/file.png` skip the gate entirely.

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

**Opens are recorded** on `Patient.planFirstOpenedAt / planLastOpenedAt / planOpenCount`, written from the patient page inside Next's `after()` so the patient never waits on a tracking write *and* the write is actually guaranteed to run (a bare floating promise silently never fired). This is the pilot's core metric: the field evidence is that engagement, not messaging, is the binding constraint — SPRINT India saw 17% acknowledge receipt, 99DOTS 33% ever use it. A pilot that can't see opens learns nothing.

**Sends are recorded too** — `planSharedAt / planShareCount`, written by the `recordPlanShare` action when the WhatsApp or Copy button is pressed. Opens alone have no denominator: "not opened" means nothing until you know whether it was ever sent. Caveat to keep in mind when reading pilot numbers: pressing the button means *WhatsApp was opened with the message ready*, not that the doctor pressed send — it over-counts sends slightly, which is acceptable at this scale and is why the UI says "Sent", never "Delivered".

`src/lib/reach.ts` turns the two counters into one answer to the only question that changes behaviour — **is WhatsApp working for this patient?** States: `never` (link not sent yet), `waiting` (sent once, under 3 days, no open), `opened`, `silent` (≥2 sends, or one send ≥3 days old, still never opened). `silent` sets `callFirst`, and both the chart card and the follow-up list then **demote WhatsApp to an icon and promote Call**, because another unread message is not follow-up, it only looks like it. Deterministic and pure like `memory.ts`; `scripts/test-reach.ts` pins the thresholds and the fail-closed cases (a share count with no timestamp reads as "never sent"). The seeded demo panel deliberately spans all four states at roughly field-realistic open rates.

## Patient side (`/p/<token>`)
A second app in the same deployment. Reached from a WhatsApp link the doctor sends — the field research was clear that patients will not install a per-clinic app, while 94% of WhatsApp users open it daily. Phone + OTP is a deliberate *later* addition, not a replacement.

**The link is the credential.** `src/lib/patientLink.ts` signs `{p, e, v}` with `MEDSPACE_PATIENT_LINK_SECRET` (Web Crypto HMAC, Edge-safe), **30-day** default (was 120 — the doctor re-sends every visit, so a short life is free and quarters the blast radius of a link that reached the wrong number). Stateless: nothing stored. `v` is now a **real per-patient version**: tokens are minted at the patient's current `linkVersion`, and `/p/[token]` rejects any token whose `v` no longer matches — so `resetPatientLinks` (bumps `linkVersion`, exposed as "Reset the link" on the chart card) cuts off exactly that patient's outstanding links without rotating the shared secret. Legacy tokens with no `k`/absent `v` still resolve as v1, so 120-day links already in the wild keep working until they expire. `readPatientLink` returns `{p, v}`; `readPatientToken` stays `string|null` for existing callers. `scripts/test-patient-link.ts` (unmodified) + `scripts/test-revocation.ts` assert tampered/forged/garbage/expired/wrong-version all fail closed.

**Plan opens are bot-filtered.** WhatsApp (and every chat app) dereferences the link once to build its preview card the instant the doctor sends it — before the patient looks. `/p/[token]` skips the open counter for known crawler UAs (`facebookexternalhit|WhatsApp|…`) and non-navigation `Sec-Fetch-Mode`, so `planOpenCount` measures real opens, not previews. Without this the pilot's core metric reads every sent link as "opened".

- `middleware.ts` lets `/p/*` through the clinic passcode; the token is its own auth.
- The page sets `robots: noindex, nofollow, nocache` — a medical record must never reach a search index.
- `Shell.tsx` (client) renders the doctor chrome or a bare patient column depending on the path, so patients never see clinic navigation.
- Links are injected into the follow-up reminder text and the prescription share, so the message a patient receives opens their live plan rather than a static dump.

**Content rules.** Show what helps the patient *act* — medicines, tests still to do, the next visit date, reports on file. Do **not** surface diagnoses, trends or interpretation: the doctor communicates those in person, and a worsening line read cold on a phone is frightening and unsafe. `src/lib/dosage.ts` translates "1-0-1" into "Morning and night" — dosing confusion is a documented adherence cause, and roughly half of Indian chronic patients are non-adherent.

Art is used generously here (consultation hero, lab band, reception footer, prepared-room empty state) because a patient reading at home is not under the doctor's 2–4 minute clock.

**Return visits — Google auth (`/plan`).** medSpace is an app patients come back to, not a link-per-visit tool: the WhatsApp link is the *bootstrap*, Google is the *durable identity*. Supabase is used **only** as a Google identity provider (`src/lib/supabase.ts`), never as a data API — patient rows are read by Prisma as `postgres`, and RLS is deny-all so the publishable key reads nothing.

Flow: `/p/<token>` offers "Sign in so you don't need the link" → `startPatientGoogleAuth` (derives the patient from the *token*, never an argument; sets a signed HttpOnly `medspace_bind` cookie; returns the Supabase authorize URL — on the server `signInWithOAuth` returns the URL, it does not redirect) → Google → `src/app/auth/callback/route.ts` exchanges the code, reads the Supabase **user.id** (never email — Workspace emails get reassigned), discards the Supabase session (medSpace mints its own cookie, so nothing to refresh and no Supabase code in the proxy), records a **pending** `PatientAccess` row and signs the patient in (they proved identity via the link). Return visits: `/welcome/patient` → Continue with Google → callback resolves **active** bindings only → 0 = neutral "if linked, it'll open" (never reveals patient status), 1 = `/plan`, many = `/welcome/patient/who` chooser.

**The patient session is medSpace's own 60-day signed cookie** (`medspace_patient`, `k:"sess"` token), not Google's — Google's would auto-renew forever and silently reopen a family member's record on a shared phone. `prompt: select_account` forces the account picker every time; `/plan` shows "Not you? Sign out". The session carries `{p, v}` and dies when `linkVersion` bumps, like any link.

**Binding is doctor-confirmed** — a plan link is forwardable and one Google account per household is normal, so a Google account only resolves to a patient on *return* once the doctor taps "This is them" on the chart (`LinkedAccounts.tsx`; `confirmPatientBinding`/`removePatientBinding`). Removing a binding also bumps `linkVersion` to cut any live session. `PatientAccess` join key is `(provider, providerUserId, patientId)` — one identity → many patients on purpose; email is display-only, no unique index. `merge.ts` dedupes bindings so a shared account on both records doesn't trip the unique. `scripts/test-patient-access.ts` covers token kind-confusion, fail-closed resolution, pending-not-resolvable, idempotent re-bind, and same-identity merge collapse. **`PatientAccess` RLS is load-bearing** (not just posture) — its migration enables RLS + REVOKEs anon/authenticated, verified on prod.

**Phone numbers → `src/lib/phone.ts`.** Never build a `wa.me` or `tel:` URL by hand. `waLink()` / `telLink()` return **null** for anything that isn't a real 10-digit Indian mobile, so a bad number yields no button instead of a dead link. This is not theoretical: a clinic phone seeded as `+91 98XXXXXX21` stripped to `919821` and shipped `https://wa.me/91919821` to patients. WhatsApp is the delivery channel for the whole product; a silently broken link there is a silently broken product.

## Traps that cost time before
- **Silent server-action failure:** a dynamic `await import()` inside `actions.ts` pulled `node:fs` into the client graph and broke *every* server action with no error anywhere — forms just no-op'd. Keep imports in `actions.ts` static and top-level. Turbopack also serves a poisoned graph long after the source is fixed: `rm -rf .next` and restart. Tell-tale sign is dev-server logs citing imports that no longer exist.
- **`next build` and `next dev` share `.next` and poison each other.** Running a production `next build` in this dir and then the dev server (or vice versa) yields `Cannot find module 'lucide-react'` / `@swc/helpers` errors and 500s on every page. Fix: `rm -rf .next` and restart dev. So do prod-build verification *last*, or clear `.next` after. (`rm -rf .next` may fail with "Directory not empty" if a server is still shutting down — stop it, wait ~2s, retry.)
- **`redirect()` throws `NEXT_REDIRECT`** — never call it inside a `try` whose `catch` treats errors as failure (e.g. the login throttle: compute the count in the try, then `redirect` *outside* it). Same family as the draft-recovery `NEXT_REDIRECT` rethrow.
- **Dev-mode `Cache-Control` is not production's.** `force-dynamic` shows `no-cache, must-revalidate` in dev but `private, no-store, max-age=0` in a real build; verify cache headers against `next start`, not `next dev`.
- **Client/server boundary:** client components must not import `db.ts`, `reports.ts`, `tasks.ts`, or `merge.ts`. Shared constants belong in `src/lib/metrics.ts`.
- **NULL-safe Prisma filters:** `{ visitId: { not: x } }` silently drops rows where `visitId IS NULL`; use an explicit `OR: [{ visitId: null }, ...]`.
- **Shell cwd:** the harness resets Bash cwd to `/Users/mac/Medspace.` (a stray dot-suffixed directory). Always `cd /Users/mac/Medspace/medspace &&` first, or installs land in the user's home `package.json`.
- **`navigator.clipboard` needs a secure context.** localhost qualifies, a clinic machine on `http://192.168.x.x` does not, and neither do some old Android WebViews. Copying the plan link is one of only two ways a patient ever gets it, so `src/lib/clipboard.ts` tries the modern API, falls back to the legacy `execCommand` selection trick, and returns `false` if both fail — the caller then *reveals* the link, pre-selected, instead of doing nothing. Never leave a bare `catch {}` on a copy path.
- **Automated clicks via `computer` sometimes don't dispatch** to React handlers even when the ref coordinates are correct. If a click appears to do nothing, confirm with `javascript_tool` (`button.click()`) before concluding the app is broken — that exact false alarm cost time here.
- **Browser screenshots are 2× scale:** a row at screenshot y=358 is CSS y=179. Prefer clicking `read_page` refs.

## Iteration backlog
- **Google auth: needs ONE Google Cloud Console step to go live.** The code is built and verified end to end — clicking "Continue with Google" drives medSpace → Supabase → Google correctly and fails only at Google's own check with `redirect_uri_mismatch`. Register `https://exzxjsdifcssyvtglhfu.supabase.co/auth/v1/callback` as an Authorized redirect URI on the OAuth client `168782668954-…apps.googleusercontent.com` (Google Cloud Console → Credentials), add the app origins to Authorized JavaScript origins, publish the consent screen (basic email/profile scopes need no review), and add `http://localhost:3000/**` + the prod callback to Supabase → Auth → URL Configuration → Redirect URLs. Then set `MEDSPACE_SUPABASE_URL` / `MEDSPACE_SUPABASE_PUBLISHABLE_KEY` / `MEDSPACE_SITE_URL` in Vercel.
- **Wipe the demo panel before real patients.** Production holds the 8 fictional demo patients (now also carrying `linkVersion`/plan-open columns). Clear with the DELETE block at the top of `scripts/seed-sql.ts` before the clinic enters anyone real.
- Vercel: connect the GitHub repo and set `DATABASE_URL` / `MEDSPACE_PASSCODE` (**6+ digits**) / `MEDSPACE_SESSION_SECRET` / `MEDSPACE_PATIENT_LINK_SECRET` in the dashboard (no MCP tool exists for env vars). The `link_version_and_login_throttle` migration is already applied to prod via the Supabase MCP.
- Deferred security items (from the 31 Jul review, not needed for a single-clinic pilot): per-patient ownership check on `/api/reports/[id]/file` (add the day report rows become tappable on `/p/*`); magic-byte sniffing on uploads (the MIME allowlist + `nosniff` is ~95% of the value); minting plan tokens on demand rather than in the render body of three pages (the follow-up list mints a fresh credential per overdue patient per render — `linkVersion` + 30-day TTL blunt it).
- Offline *reads*: drafts survive a dropped connection but charts still need the server. Cloud hosting is now the chosen path, so this means a service worker + local cache + sync queue — a substantial build. Don't start it speculatively.
- OCR/AI parsing of report photos to prefill key values (needs an API-key decision; manual entry works today).
- Draft recovery covers only the visit form, not the report form or demographics edit.
- Verify A5 print output on a real printer during the pilot.
