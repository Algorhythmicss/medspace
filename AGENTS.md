<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# medSpace — memory-first clinic OS

Doctor-side app for Indian private OPD. Enter as a faster EMR, retain via accumulated patient memory. Strategy and field research: `../research/virtual-observation-day.md`.

**Product direction (1 Aug 2026):** medSpace is an **app patients return to**, not a link-per-visit tool. The doctor side is the wedge (faster than paper); the patient side closes the follow-up loop. The WhatsApp link is the *bootstrap* (first contact) and **Google sign-in is the durable patient identity** — see "Patient side" and "Google auth". Single-clinic by construction (the `Clinic` row is a singleton).

Named **medSpace**. It was briefly "Kyra" — that is a *different product* of the user's; never reintroduce the name.

## Time budgets (the spec — regressions here are bugs)
- Patient lookup → chart ≤5s (name / phone / fileNumber)
- Memory card ≤5 lines, absorbable in a 10s glance
- Repeat Rx ≤30s (one tap + save); new Rx ≤90s
- Zero training; phone-first (375px); assume no receptionist and no reliable internet

## Stack
Next.js 16.2 (App Router, `src/`, Turbopack), Tailwind v4, Prisma 7 with the **Postgres** driver adapter (`@prisma/adapter-pg`). Client is generated to `src/generated/prisma` — import from `@/generated/prisma/client`. `src/generated/` is not deployed, so `build` and `postinstall` both run `prisma generate`.

The passcode gate lives in **`src/proxy.ts`** — Next 16 renamed the `middleware` file convention to `proxy` (same Edge runtime, same `export const config`); the export is `export async function proxy`. There is **no `src/middleware.ts`** and recreating it hard-errors the build (both files present is illegal).

`src/lib/db.ts` constructs the client **lazily behind a Proxy**: a build with no `DATABASE_URL` must succeed (verified), otherwise Vercel can't build before env vars exist. Supabase auth uses `@supabase/ssr` + `@supabase/supabase-js`.

## Commands
- `pnpm dev` — dev server (or `preview_start` with launch config `medspace-dev`)
- `npx prisma migrate deploy` — apply migrations · `npx tsx prisma/seed.ts` — reseed the demo panel
- `npx tsc --noEmit` — typecheck · `npx next build` — production build
- Test suites (reseed after): `npx tsx scripts/` → `test-merge.ts`, `test-report.ts`, `test-supersede.ts`, `test-patient-link.ts`, `test-phone.ts`, `test-reach.ts`, `test-revocation.ts`, `test-patient-access.ts`. No framework — each is a plain script with an `expect(cond, label)` helper printing `ALL PASS` / `TESTS FAILED`.

## Environment variables (canonical list — `.env.example` is the source)
Seven vars; **all required at runtime**, and the four below `DATABASE_URL` throw at *request* time (not build) if unset, so a bad deploy builds green then breaks live:
- `DATABASE_URL` — Postgres (prod: pooled, port 6543)
- `MEDSPACE_PASSCODE` — clinic passcode (**6+ digits in prod**; dev is `4321`)
- `MEDSPACE_SESSION_SECRET` — signs the **doctor** session cookie + the login-throttle IP hash
- `MEDSPACE_PATIENT_LINK_SECRET` — signs **all patient tokens** (plan link, bind, chooser, and the patient session cookie) — product is broken without it
- `MEDSPACE_SUPABASE_URL`, `MEDSPACE_SUPABASE_PUBLISHABLE_KEY` — Supabase as a Google identity provider (publishable key is public by design; RLS deny-all means it reads nothing)
- `MEDSPACE_SITE_URL` — absolute origin for the OAuth redirect; must match Supabase's redirect allow-list exactly; set per-environment; never derived from the Host header

Two independent secret domains: `MEDSPACE_SESSION_SECRET` (doctor) and `MEDSPACE_PATIENT_LINK_SECRET` (everything patient-facing). They do not overlap.

## Databases
**Local dev = Postgres in Docker. Never point local tooling at production.**

```bash
docker run -d --name medspace-pg -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=medspace -p 5433:5432 postgres:17
```

`.env` and `.env.local` both hold the container URL. **Never put the production `DATABASE_URL` in either file** — the prisma CLI reads `.env` and `prisma/seed.ts` deletes every row before seeding, so a production URL there would destroy live patient records. Production values live only in Vercel's env settings; do production schema/data work through the Supabase MCP (`apply_migration`, `execute_sql`).

**Production:** Supabase project `medspace`, ref `exzxjsdifcssyvtglhfu`, ap-south-1 (Mumbai). Vercel team `team_S0YB8RxcpPfM0jAPH6l3McvY`. **Repo:** https://github.com/Algorhythmicss/medspace (private) — Vercel should be connected so pushes auto-deploy.

`scripts/seed-sql.ts` emits the whole demo panel as SQL (deterministic ids, wipes first) for loading a remote DB via `execute_sql` without a local connection string. It and `prisma/seed.ts` are **two independent implementations of the identical 8-patient demo panel** (same fileNumbers, drugs, visits, reach states) — keep them byte-equivalent by hand or local and prod demo data drift. Both open with a hardcoded wipe in strict child→parent order (`PatientAccess → CarePlanTask → Observation → PrescriptionItem → Prescription → Report → Visit → Condition → Allergy → Patient → Drug → Clinic`); a new table must be appended to **both** wipe lists at the right dependency position.

### RLS is deny-all — and it's the only access control on the publishable key
Every table has RLS enabled with **no policies**, deliberately: medSpace connects as the `postgres` role via Prisma (which bypasses RLS), while anon/authenticated PostgREST roles are denied outright, so the publishable key can read/write nothing. `get_advisors` reporting the INFO-level "RLS enabled, no policy" note is the intended state, not a defect. **Do not** "fix" it by adding permissive policies — every Supabase/Google tutorial will suggest `USING (auth.uid() = ...)`; medSpace uses Supabase as an identity provider only, never a data API.

**Every new Prisma table is a security hole until its migration says otherwise.** Prisma creates tables with RLS **off**, and this project's default privileges grant `anon`/`authenticated` full access on new `public` tables. Every migration that creates a table MUST hand-append `ALTER TABLE "X" ENABLE ROW LEVEL SECURITY;` + `REVOKE ALL ... FROM anon, authenticated`, guarded in a `DO $$ ... IF EXISTS (SELECT 1 FROM pg_roles ...) $$` block so the identical file runs on local Docker Postgres (no `anon` role) too. Apply to prod via the Supabase MCP `apply_migration` with byte-identical SQL, then verify with the `pg_class`/`role_table_grants` query (require `rls=true`, `pol=0`, `grants=none`).

**Gotcha (fixed 1 Aug 2026):** the `20260730120000_init` migration created the 11 core tables (Patient, Report, Observation, Visit, Prescription, PrescriptionItem, Condition, Allergy, CarePlanTask, Clinic, Drug) with **no RLS** — prod was locked down out-of-band (a Supabase-side `enable_rls_deny_all`), so the checked-in migrations didn't reproduce the invariant and a fresh `prisma migrate deploy` to an empty DB would have left patient records open. `20260801090000_enable_rls_core_tables` retrofits the guarded ENABLE+REVOKE for all 11. Prod already has RLS via the out-of-band step, so the Prisma and `supabase_migrations` ledgers diverge by design (documented tradeoff of "prod schema work goes through the MCP"). 13 tables total.

## Auth & security posture
Doctor gate: signed 12h session cookie (Web Crypto HMAC, Edge-compatible — `src/lib/auth.ts`), enforced by `src/proxy.ts`. **Public allowlist = five surfaces**, each self-authenticating so none needs the passcode: `/login`, `/welcome*`, `/p/*` (signed token in the path), `/auth/*` (the Google callback, validates itself off the single-use `code`), and `/plan` (exact match, not a `/plans*` prefix — the returning patient, authed by its own `medspace_patient` cookie). Everything else 307→`/login` (bare `/`→`/welcome`). The matcher excludes by **prefix** (`_next/static`, `_next/image`, `favicon.ico`, `art/`, the root `*.svg`s), not by extension — the old `.*\.(png|jpg…)$` pattern let `/patients/<id>.png` skip the gate.

**The proxy is defence in depth, not the authorization boundary** — a Server Action is a POST dispatched by action id to whatever route its component lives on, so an exempt route could run one unauthenticated. Therefore:
- **Doctor-side actions call `assertClinicSession()` (`src/lib/session.ts`) first** — `createVisit`, `createPatient`, `createReport`, `updatePatient`, `mergePatientRecords`, `updateStickyNote`, `recordPlanShare`, `completeTask`, `resetPatientLinks`, `confirmPatientBinding`, `removePatientBinding`. (`signOut` only clears the cookie.)
- **Patient-side actions must NOT gate on the passcode** — they run pre-clinic-auth or under a different credential: `startPatientGoogleAuth` (authorizes off the plan token it's handed, deriving the patient server-side, never from an argument), `selectPatientForSession` (authorized by the signed `medspace_choose` token + a re-checked active binding), `patientSignOut` (clears the patient cookie). **Classify any new action doctor- vs patient-side before adding `assertClinicSession`** — blindly adding it to a patient action breaks sign-in.
- **`/api/reports/[id]/file` checks the session in the handler** (`hasClinicSession`) and 404s without it — not relying on the proxy alone.
- **Login is throttled**: 5 failed attempts per salted-hashed IP per 15 min → `?e=slow`, the door stops answering (`login/page.tsx` + `hashLoginKey` in `auth.ts`, backed by `LoginAttempt`). The passcode is a short PIN, brute-forceable in under a minute without this. `redirect()` throws `NEXT_REDIRECT`, so the throttle counts inside a `try` but `redirect`s outside it.
- **Uploaded files fail closed on MIME**: only `image/jpeg|png|webp|gif` + `application/pdf` are served `inline`; anything else is stored as `application/octet-stream` and served `Content-Disposition: attachment` (`INLINE_SAFE_MIME` in `reports.ts`, enforced on write in `createReport` and on read in the file route). Stops an uploaded SVG/HTML executing on-origin with the doctor's cookie.
- **`next.config.ts`** sets `Referrer-Policy: same-origin` (the patient link is a credential in the URL), `X-Content-Type-Options: nosniff`, CSP `frame-ancestors 'none'; object-src 'none'; base-uri 'self'`, `images.localPatterns` pinned to `/art/**` (so `/_next/image` can't proxy `/api/reports/.../file`), and `Cache-Control: private, no-store, max-age=0` on **both** `/p/:token*` and `/plan` (keep a credential-bearing/authenticated medical page off shared-device disk and CDN caches).

## Data model
`prisma/schema.prisma`. Conventions and load-bearing choices:
- **`Patient` is the aggregate root.** Every direct child (`Condition`, `Allergy`, `Visit`, `Observation`, `Report`, `CarePlanTask`, `PatientAccess`) is `onDelete: Cascade`; `Prescription`→`Visit` and `PrescriptionItem`→`Prescription` too. **But `Observation`→`Visit` and `CarePlanTask`→`Visit` are `onDelete: SetNull`** — observations are the trend source and tasks the continuity spine, so they must outlive the visit that spawned them. This is *why* `visitId` can be null, and *why* the NULL-safe-filter trap below exists. Do not "tidy" these to Cascade.
- **String pseudo-enums, never native DB enums** (`schema.prisma:2` — keeps migrations simple). Every categorical column is a `String` with legal values in a trailing `//` comment: `Condition.status`, `Report.kind`, `Observation.source`/`type`, `CarePlanTask.kind`/`status`, `PatientAccess.status`/`boundVia`, `PrescriptionItem.frequency`. **There is zero DB-level validation** — app code enforces it, and the canonical `Observation.type` list + the aliases that match lab values to orders live in `src/lib/metrics.ts`. Adding a status/type is a code change, not a migration.
- **`Clinic` is a hardcoded single-row singleton** (`id @default("clinic")`; the seed writes one row with `id:"clinic"`). This is the single-tenant boundary; any multi-clinic move starts here. `regNumber` is required — legally mandatory on every electronic Rx (Telemedicine Practice Guidelines 2020).
- Index rationale: `PatientAccess` has `@@unique([provider, providerUserId, patientId])` (its leftmost prefix also serves the return lookup — no separate index) + `@@index([patientId, status])`; **no unique index on `email`** (family members share one; it's mutable/reassignable). `LoginAttempt` has `@@index([key, failedAt])`.

## Architecture notes
- `src/lib/memory.ts` — `buildMemoryCard` returns the **whole briefing payload from one query** (no second "Trends" fetch): the ≤5 card lines (trends with per-metric clinical `minDelta`, latest vs previous **and** vs oldest-in-window for slow drift; overdue-task gaps; reports newer than last visit; last visit) **plus** headline, allergies, `activeMeds` (latest Rx), and up to 4 sparkline `metrics`. Craft rules: capped at 5 lines (deletion is the craft); multiple overdue tasks collapse to ONE line (titles omitted — the chart lists them); trends capped at top 2 by severity with improvements down-weighted 10×; the sticky note is deliberately inline/editable, not a card line. Sparkline colour encodes clinical direction (worsening=warm, improving=green), not decoration.
- `src/app/page.tsx` (Today) — three server-computed lists: **"Waiting on you"** = count of pending tasks with `dueDate < todayStart`, badge → `/followups`; **"Expected today"** = pending tasks due in `[todayStart, todayEnd)`; **"Recently seen"** = 6 patients by `updatedAt desc`. GOTCHA: `updatedAt` is Prisma `@updatedAt`, so *any* patient write bumps it (incl. `recordPlanShare` — merely sending a link) — "Recently seen" is really "recently modified", not a visit log. Note "overdue" is defined **two ways**: Today counts *tasks* with `dueDate < todayStart` ("Overdue patients", so 2 tasks inflate it); `/followups` groups by *patient* with `dueDate < now` — the numbers can legitimately disagree.
- `src/app/actions.ts` — all server actions. `createVisit` creates FOLLOW_UP/LAB_TEST tasks, auto-closes prior pending follow-ups (patient showed up), supersedes overlapping stale lab orders (`src/lib/tasks.ts`), and bumps `Drug.useCount`. **Autosuggest caveat:** `useCount` only re-ranks the *seeded* formulary — `createVisit`'s `updateMany({where:{name}})` updates 0 rows for a free-typed drug and nothing ever inserts a `Drug`, so a "+ Add '<name>'" medicine is stored on the `PrescriptionItem` only and never becomes a future suggestion. The catalogue is fixed until reseeded.
- `src/lib/tasks.ts` — supersedure + `completeMatchingLabTasks` (an arriving lab value closes the order that asked for it, matched via aliases in `metrics.ts`).
- `src/lib/merge.ts` — duplicate-record merge in a transaction; dedupes conditions/allergies/`PatientAccess` case-insensitively, backfills only blank keeper fields, **never overwrites the keeper — except `stickyNote`**, which is the one field combined from both (de-duped with " · "). No un-merge. **Discovery path:** phone-twin detection — the edit page and `NewPatientForm` surface "same phone as another record → merge"; the confirm screen defaults the keeper to the record with more visits.
- Report attachments live **in Postgres** (`Report.fileData`, 4MB cap), served by `/api/reports/[id]/file` — serverless has no persistent FS, and this keeps files off public URLs. Never `select fileData` in list/chart queries.
- **Offline drafts:** `VisitForm` **and** `ReportForm` autosave to `localStorage` (`medspace:visit-draft:<id>` / `medspace:report-draft:<id>`, 300ms debounce), restore on mount with a "Start fresh" escape, drop on submit, and **write back if the save throws**. A `NEXT_REDIRECT` digest must be rethrown, not treated as failure. Report caveat: a chosen file attachment can't be restored from localStorage (only typed values) — the banner tells the doctor to re-attach. Remaining gap: the demographics edit form has no draft recovery.
- **Patient lookup** (`/api/search`) — name (case-**insensitive** as of 1 Aug 2026), phone (plain substring), or fileNumber; `take 8`, `updatedAt desc`. Known gap: phones are stored exactly as typed (no normalisation), so a digits-only query won't substring-match a stored `+91 ...` — phone search and same-phone duplicate detection miss formatted numbers until phones are normalised.
- WhatsApp is always a `wa.me` deep link with prefilled text — the doctor presses send, never auto-send.
- Printed Rx carries the reg number (legal) and a QR encoding `/scan/<fileNumber>` for instant lookup at the next visit.

## Design language — derived from the clinic art library
The app shares a world with the ten editorial illustrations in `public/art/`. Every colour was **sampled from those paintings**, not invented: periwinkle/cornflower walls, warm cream light, sea-glass teal cabinetry, jade planting, small coral and butter accents. `globals.css` self-describes as "Headspace-inspired clinical warmth": what was **rejected** from Headspace was only the navy+hot-orange *palette* (the orange fought the art); its *structure* — filled hero cards, very large radii, colour doing the emotional work, generous air — is deliberately **retained**. The governing rule: **the hero is the single place colour is allowed to be loud** (a filled periwinkle-gradient card with a warm radial `::before` bloom); everything supporting it stays light and quiet on `--cream`.

**Reuse the vocabulary — never invent utilities or ad-hoc `text-[Npx]`:**
- **Colour tokens:** ground `--cream #faf4ea`; ink is violet-tinged `--ink #2b2a33` (+`--ink-2`/`--ink-3`), never neutral black; `--surface #fff`, `--sunk #f2ebde`, `--hairline`; brand `--peri #5b67b0` with hero gradient `--peri-1 #6470c4 → --peri-2 #464f96` (155°); hero text `--peri-ink`/`--peri-ink-2`; semantics `--coral` (alert), `--jade` (good), `--butter` (attention), `--teal`, each with a `--*-soft` tint.
- **Type scale classes:** `.t-hero .t-title .t-lead .t-head .t-body .t-bodyL .t-cap .t-micro .t-num` (Manrope display + system stack / SF Pro on Apple).
- **Component classes:** `.card`, `.hero`, `.field`, `.btn`/`.btn-primary`, `.chip`, `.label`, `.rows` (hairline row separators), `.nav-item`, `.material`/`.material-dark` (translucent blur chrome), `.ring-focus`, `.kbd`, `.rise`.
- **Radii/shadow tokens:** `--r 20px` / `--r-hero 26px` / `--r-field 14px`; `--lift` / `--lift-lg` / `--lift-hero`.
- **On/active state is a data-attribute, not a modifier class:** `.chip[data-on="true"]`, `.nav-item[data-active="true"]`. (Regression once lost the selected-chip style in a rewrite — data-on chips looked unselected. Watch this.)
- **Motion:** one easing curve everywhere — `--spring: cubic-bezier(0.32, 0.72, 0, 1)`. `.rise` is the standard entrance (translateY+fade, 0.44s). Pressables shrink on `:active` (`.btn` 0.97, `.chip` 0.95). A `prefers-reduced-motion` block flattens all durations globally — new animations get that free but must not rely on animation for correctness.

### Using the art — the placement rule
`src/components/Art.tsx` exposes `ArtBand` (shallow crop) / `ArtSpot` (4:3 card) over a named catalogue. **Illustration belongs at moments of pause — signing in, an empty list, a finished task — never on the working surfaces** (chart, visit form, prescription). A doctor has 2–4 min/patient; decoration there costs seconds. The palette carries the character everywhere else. Patient-facing pages use art generously (a patient reading at home isn't on the clock).

Placements: `/welcome` hero (`consultation`), login (`reception`), Today masthead (`huddle`, greeting set *on* the art so search stays near the top for the ≤5s budget), follow-ups empty state (`discharge`), new patient (`reception`), `/welcome/patient` explainer (`discharge`), `/welcome/patient/who` chooser (`reception`), and the patient plan (`consultation` hero, `lab` band, `reception` footer, `room` empty state). **Assets:** sources live in `/Users/mac/Medspace/art-src` (not in the repo); converted with sharp to `public/art/*.webp` at 1400w + `@sm` 720w — **21MB of PNG became 1.1MB**, which matters on a clinic connection. Never ship the PNGs. Constraints: 4:3 landscape, action in the middle two-thirds on shallow crops, subtle scrim only when contrast demands, preserve paper texture (no heavy grading).

### Chrome split — `Shell.tsx`
Branches on pathname into three layouts: **patient** (`startsWith('/p/')` OR `=== '/plan'`) → bare `max-w-[520px]` column; **public** (`/login` or `startsWith('/welcome')`) → bare `max-w-[460px]` centred column; **everything else** → full doctor chrome (ConnectionBanner + Sidebar `lg:pl-[248px]` + TabBar; main `max-w-md → md:700 → lg:1080`, `pb-28` for the mobile TabBar, `print:max-w-none`). **Gotcha:** the split is a positive predicate for patient/public and *defaults to doctor chrome* — a new patient- or public-facing route outside `/p/`, `/plan`, `/login`, `/welcome` will silently render clinic navigation the audience can't use. Add new such routes to the predicate.

## Entry points
One deployment, two audiences:
- `/welcome` — public front door: "I'm the doctor" / "I'm a patient". Unauthenticated `/` redirects here.
- `/login` — clinic passcode. A deep link into a clinic screen redirects here with `?next=` and returns after, so only the bare domain gets the chooser.
- `/p/<token>` — the patient's signed link. **Never routes through a chooser** — tapping WhatsApp lands directly on the plan.
- `/plan` — the returning, Google-signed-in patient (own cookie).
- `/welcome/patient` — leads with **Continue with Google** (returning patients), then "Already have the link?" (`OpenMyPlan.tsx`), then WhatsApp/Call to ask for a link.

## Pilot distribution & adoption
Every chart carries a **plan-link card** (`SendPlanLink.tsx`): "Send on WhatsApp" opens the **doctor's own** WhatsApp via `wa.me` with the message prefilled, plus Copy (SMS / read aloud). No Business API, no Meta verification, no DLT, no per-message cost — deliberately what makes a 100-patient pilot possible without paperwork. Copy uses `src/lib/clipboard.ts` (secure-context API → `execCommand` fallback → reveal-the-link-preselected), never a bare `catch{}`.

**Opens** are recorded on `Patient.planFirstOpenedAt / planLastOpenedAt / planOpenCount`, written from `/p/[token]` inside Next's `after()` (guaranteed post-response, unlike a floating promise), **bot-filtered** (WhatsApp dereferences every link it sends before the patient looks — crawler UAs and non-navigation `Sec-Fetch-Mode` are skipped). This is the pilot's core metric — engagement, not messaging, is the binding constraint (SPRINT India 17% acknowledged, 99DOTS 33% ever used). **`/plan` deliberately does NOT increment `planOpenCount`** ("opens" means "the WhatsApp link was opened") — that's the sole reason open-tracking lives on the token page, not in the shared `PlanView`.

**Sends** are recorded too — `planSharedAt / planShareCount` via `recordPlanShare` when the WhatsApp/Copy button is pressed. Opens have no denominator without sends. The button firing means "WhatsApp opened with the message ready", not "delivered" — over-counts slightly, hence the UI says "Sent", never "Delivered".

`src/lib/reach.ts` turns the two counters into the one behaviour-changing answer — **is WhatsApp working for this patient?**: `never` / `waiting` (sent once, <3 days, no open) / `opened` / `silent` (≥2 sends or one ≥3 days old, still unopened). `silent` sets `callFirst`, and both the chart card and follow-up list **demote WhatsApp to an icon and promote Call** — another unread message isn't follow-up. Pure + deterministic like `memory.ts`; the seed spans all four states at field-realistic rates.

## Patient side (`/p/<token>` and `/plan`)
A second app in the same deployment, reached first from a WhatsApp link (patients won't install a per-clinic app; 94% of WhatsApp users open it daily), then via Google on return. `Shell.tsx` gives it a bare column. Both pages render the shared `PlanView`; `/p/[token]` also does version-checking + open-tracking.

**The link is the credential.** `src/lib/patientLink.ts` signs tokens with `MEDSPACE_PATIENT_LINK_SECRET` (Web Crypto HMAC, Edge-safe). **All four token kinds share this one secret / trust domain**, separated only by a `k` discriminator: the **plan link** (no `k`, 30-day, in the URL path), **`bind`** (10-min, `medspace_bind` cookie), **`who`** (chooser, 10-min, `medspace_choose` cookie), and **`sess`** (60-day patient session, `medspace_patient` cookie). Consequences: the patient session cookie is signed with the **patient-link** secret, not the clinic session secret; rotating `MEDSPACE_PATIENT_LINK_SECRET` is the blunt "revoke every link, session, and in-flight bind" lever; and `readPatientLink` **rejects any token carrying a `k`** so a captured `sess`/`bind`/`who` value can't be replayed as a `/p/` URL (they all also carry `p/v/e`).

**Per-patient revocation:** the plan link's `v` is minted at the patient's current `linkVersion`; `/p/[token]` and `/plan` reject any token whose `v` no longer matches. `resetPatientLinks` ("Reset the link" on the chart) bumps `linkVersion` — cutting exactly that patient's outstanding links + sessions without rotating the shared secret. Removing a Google binding also bumps it. Legacy 120-day links (absent `v`) resolve as v1, so links already in the wild keep working. Life was cut 120→30 days (doctor re-sends every visit; quarters the blast radius of a wrong number). `test-patient-link.ts` (must pass **unmodified**) + `test-revocation.ts` cover tamper/forge/garbage/expiry/wrong-version.

**Content rules.** Show what helps the patient *act* — medicines, tests still to do, next visit, reports on file (title + date only, **non-tappable**). Do **not** surface diagnoses, trends or interpretation — the doctor communicates those in person. TRAP: `loadPlanData` selects `Report.summary` but `PlanView` deliberately never renders it (a summary read cold is interpretation) — do not "finish" that feature. `src/lib/dosage.ts` turns "1-0-1" into "Morning and night" (dosing confusion is a documented adherence cause).

**Phone numbers → `src/lib/phone.ts`.** Never build a `wa.me`/`tel:` URL by hand. `waLink()`/`telLink()` return **null** for anything not a real 10-digit Indian mobile, so a bad number yields no button, not a dead link. Not theoretical: a clinic phone seeded as `+91 98XXXXXX21` once shipped `wa.me/91919821`.

### Google auth — the durable identity
Supabase is used **only** as a Google identity provider (`src/lib/supabase.ts`); patient rows are read by Prisma. The Supabase session is discarded at the callback — medSpace mints its own cookie — so there's nothing to refresh and no Supabase code in the proxy.

**First bind (from a plan link):** `/p/<token>` → "Sign in for next time" → `startPatientGoogleAuth(planToken)` derives the patient from the token, sets a signed `medspace_bind` cookie, returns the Supabase authorize URL (on the server `signInWithOAuth` returns the URL, doesn't redirect) → the client `window.location.assign`es it → Google → `src/app/auth/callback/route.ts` exchanges the code, reads the Supabase **`user.id`** (never email — Workspace emails get reassigned), signs out of Supabase, records a **pending** `PatientAccess` row, and signs the patient in (they proved identity via the link). **Return (no link):** `/welcome/patient` → Continue with Google → callback resolves **active** bindings only → 0 = neutral `?e=nolink` (never reveals whether the account is a patient — clinic membership is itself sensitive), 1 = `/plan`, many = `/welcome/patient/who` chooser.

- **The session is medSpace's own 60-day signed cookie**, not Google's (Google's auto-renews forever and would silently reopen a family member's record on a shared phone). `prompt: select_account` forces the account picker every time; `/plan` shows "Not you? Sign out". Carries `{p, v}`, dies when `linkVersion` bumps.
- **`sameSite: "lax"` on `medspace_bind`/`medspace_choose`/`medspace_patient` is load-bearing** — `/auth/callback` and `/plan` are the end of a redirect chain originating at accounts.google.com; `strict` would drop them on the return hop. Do not "harden" to strict.
- **Binding is doctor-confirmed** — a plan link is forwardable and one Google account per household is normal, so an account only resolves on *return* once the doctor taps "This is them" (`LinkedAccounts.tsx` → `confirmPatientBinding`/`removePatientBinding`). Join key `(provider, providerUserId, patientId)` — one identity → many patients on purpose; email is display-only. `bindIdentity`'s upsert-update refreshes **only email, never `status`** (a re-sign-in must not silently re-activate a revoked binding). `patientsForIdentity`/`hasActiveAccess` resolve **active only** and fail closed ([] for unknown). Fan-out is **capped at 8** (a Google account on >8 patients is link-harvesting, not a family), ordered most-recently-used first with `nulls: "last"` (Postgres sorts NULLs first on DESC).
- **Chooser IDOR guard:** the `medspace_choose` cookie's id list is an untrusted hint — `selectPatientForSession` re-verifies the submitted id is both in the signed list AND still has an active binding before minting a session. The chooser shows **first name + age/sex only** (other household members' identities are sensitive).
- **`PatientAccess` RLS is load-bearing, not posture** — without it, anyone with the public publishable key could `POST /rest/v1/PatientAccess` and bind their Google account to any patient. Its migration enables RLS + REVOKEs anon/authenticated, verified on prod.
- `merge.ts` dedupes bindings so a shared account on both records doesn't trip the unique. `test-patient-access.ts` covers kind-confusion, fail-closed resolution, pending-not-resolvable, idempotent re-bind, and same-identity merge collapse.

**Operational (bring-up, 1 Aug 2026 — verified live end to end):** two console gotchas hit and fixed — (1) Google `redirect_uri_mismatch` → register `https://exzxjsdifcssyvtglhfu.supabase.co/auth/v1/callback` as an Authorized redirect URI on the OAuth client; (2) Supabase `invalid_client "provided client secret is invalid"` (surfaces at `/auth/callback?error=...Unable to exchange external code`) → the Google **client secret** in Supabase was wrong; re-paste fixed it. Diagnose auth issues with `get_logs(service:"auth")` on the Supabase MCP — it shows the exact Google rejection. **Currently sharing another product's ("Leetify") Google OAuth client** — safe for data isolation (identities are Supabase-project-scoped, and medSpace has its own project), but the consent screen shows "Leetify"; a **dedicated Google Cloud project + consent screen** is needed before real patients (also decouples the secret). External user type + Publish to production (basic email/profile scopes need no verification review; Testing mode caps at 100 users and expires consent in 7 days).

## Traps that cost time before
- **Silent server-action failure:** a dynamic `await import()` in `actions.ts` pulled `node:fs` into the client graph and broke *every* action with no error — forms just no-op'd. Keep `actions.ts` imports static/top-level. Turbopack also serves a poisoned graph after the source is fixed: `rm -rf .next` and restart.
- **`next build` and `next dev` share `.next` and poison each other** → `Cannot find module 'lucide-react'` / `@swc/helpers` and 500s. Fix: `rm -rf .next`, restart dev. Do prod-build verification last, or clear `.next` after. (`rm -rf .next` may fail "Directory not empty" while a server shuts down — wait ~2s, retry.)
- **`redirect()` throws `NEXT_REDIRECT`** — never inside a `try` whose `catch` treats errors as failure (login throttle: count in the try, `redirect` outside).
- **Dev-mode `Cache-Control` ≠ production's** — `force-dynamic` shows `no-cache, must-revalidate` in dev but `private, no-store, max-age=0` in a real build. Verify cache headers against `next start`.
- **Client/server boundary:** client components must not import `db.ts`, `reports.ts`, `tasks.ts`, `merge.ts`, `patientAccess.ts`, `session.ts`, `supabase.ts`. Shared constants belong in `metrics.ts`; client components import server actions only.
- **NULL-safe Prisma filters:** `{ visitId: { not: x } }` silently drops `visitId IS NULL` rows (they exist because of the SetNull FKs above); use `OR: [{ visitId: null }, ...]`.
- **Shell cwd:** the harness resets Bash cwd to `/Users/mac/Medspace.` (stray dot-suffixed dir). Always `cd /Users/mac/Medspace/medspace &&` first, or installs land in the home `package.json`.
- **`navigator.clipboard` needs a secure context** (localhost yes; `http://192.168.x.x` and old Android WebViews no). `clipboard.ts` falls back and reveals the link; never a bare `catch{}` on a copy path.
- **Automated `computer` clicks sometimes don't dispatch** to React handlers — confirm with `javascript_tool` (`button.click()`) before concluding the app is broken.
- **Browser screenshots are 2× scale:** a row at screenshot y=358 is CSS y=179. Prefer clicking `read_page` refs.

## Iteration backlog
- **Google auth is LIVE** (built + verified end to end with a real sign-in, 1 Aug 2026). Remaining before real patients: (1) **dedicated Google Cloud project** so the consent screen shows the clinic, not "Leetify"; (2) prod redirect config + `MEDSPACE_SUPABASE_URL`/`_PUBLISHABLE_KEY`/`SITE_URL` in Vercel; (3) publish the consent screen to production.
- **Wipe the demo panel before real patients** — prod holds the 8 fictional patients. Clear via the DELETE block atop `scripts/seed-sql.ts`.
- **Vercel:** connect the repo, set all 7 env vars (`MEDSPACE_PASSCODE` **6+ digits**). The `link_version_and_login_throttle` and `patient_access` migrations are already applied to prod via the Supabase MCP; core-table RLS is on prod via the out-of-band `enable_rls_deny_all`.
- **Phone normalisation for search/dedup** — stored phones aren't normalised, so search-by-phone and same-phone duplicate detection miss formatted numbers. Normalise on write (reuse `phone.ts`) to close it.
- Deferred security items (single-clinic pilot doesn't need them): per-patient ownership check on `/api/reports/[id]/file` (add the day report rows become tappable); magic-byte upload sniffing (allowlist + nosniff is ~95%); minting plan tokens on demand rather than in three pages' render bodies.
- Offline *reads* (service worker + local cache + sync queue) — substantial; don't start speculatively.
- OCR/AI parsing of report photos (needs an API-key decision; manual entry works today).
- Draft recovery for the demographics edit form (visit + report forms already have it).
- Verify A5 print output on a real printer during the pilot.
