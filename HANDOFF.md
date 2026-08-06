# medSpace — Handoff & Context

**Read this first.** It is the orientation map for anyone (human or agent) picking this project up cold. It carries the *why*, the guardrails, a snapshot of what's built, and exactly what's next. For the *how* — architecture, data model, security, design system, and the traps that have cost time — read [`AGENTS.md`](AGENTS.md), the technical ground truth. `README.md` is the human-facing intro + quick start.

> If you were told "explore this repo": read this file top to bottom, then `AGENTS.md`. That's the whole context.

---

## 1. What medSpace is

A **memory-first clinic OS for a single Indian private-OPD clinic.** It is deployed at `medspace-nu.vercel.app`.

The thesis, in one line: **it enters a clinic as a *faster-than-paper* way to run a consult, earns retention by accumulating a patient's memory across visits, and closes the follow-up loop by giving the patient their own live care plan.**

Three deliberate strategic bets — these are the product, not features:

1. **Memory, not records.** The doctor has ~2–4 minutes per patient. The centrepiece is a deterministic **memory card** (`src/lib/memory.ts`) — ≤5 lines absorbable in a glance, surfacing *what changed since last time*. Not an EMR you browse; a memory that reads itself. (This is the pivot: from "EMR" to a **continuity-of-care memory layer**.)
2. **The follow-up loop is the wedge.** After a visit the doctor sends the patient a private WhatsApp link to their live plan (meds, tests, next visit). The binding constraint in the field is **reach — do patients actually open it** — *not* sending (field evidence: SPRINT India ~17% acknowledged receipt; 99DOTS ~33% ever used it). So the app **measures opens**, and when WhatsApp clearly isn't reaching someone it tells the doctor to **call instead** (`src/lib/reach.ts`). It also **recalls chronic patients who have drifted away** (`src/lib/recall.ts`).
3. **An app patients return to.** The WhatsApp link is the *bootstrap*; **Google sign-in is the durable identity** so patients never need to hunt the link again (doctor-confirmed on the chart). One account can hold a whole household.

**Single-clinic by design.** One doctor, optional front-desk/nursing staff. Not multi-tenant. This shapes the whole threat model (below) and the refusal to build hospital-scale machinery.

---

## 2. Guardrails — read before building anything

### The anti-bloat firewall (do **NOT** build these)
The competitor everyone points at (EkaCare) is the cautionary tale: it became a bloated everything-app. The user has repeatedly and explicitly refused the following. Treat this as a hard firewall:

- **No booking calendar / appointment slots / token system.** The front-desk queue is a **walk-in live list only**, never a scheduler.
- **No billing / GST / day-book / invoicing.**
- **No automated reminder cron** (reminders are *manually sent* by the doctor from the follow-ups screen).
- **No ABHA / health-locker / ABDM integration** (compliance-heavy; not for a single-clinic MVP).
- **No teleconsult module, no insurance/claims, no marketplace, no full HMS modules, no consumer-PHR sprawl.**
- **No "AI scribe" as the spine.** The memory card is deterministic on purpose.

When you think of a new capability, first ask: does it serve *this* doctor's ≤4-min consult or the follow-up loop, without becoming a module? If unsure, propose it — don't build it.

### The two safety lines on the memory card (never cross)
- **Patient-logged home readings never fuse into the clinical trend/arrow.** A home cuff reading must not drive a clinical decision; it shows in a *separate tagged strip* (`memory.ts` enforces this; clinic and home observations are even queried on separate windows).
- **Clinical decisions never fuse onto the patient surface.** The patient plan is an *act-on-it to-do list*, not a chart. `Report.summary` is deliberately fetched-but-not-rendered on the patient side.

### Design bar: Apple-intuitive and self-teaching
- iOS conventions, warm clinical calm (see the design system in `AGENTS.md` / `globals.css`). One easing curve (`--spring`), page transitions, instant loading skeletons, tactile press feedback.
- **Self-teaching is a hard requirement:** doctors and staff must learn the whole app on their own, fast, with **no training**. Anything "not obvious to use" is treated as a **bug**. Bake discoverability into the existing design language (orientation lines, guiding empty states, forms that offer the next step) — never a separate tutorial/onboarding overlay.
- **The user does the final design polish themselves.** Prioritise functional completeness and consistency over pixel-perfection.

### Deployment & data safety (the ways this project has broken)
- **Vercel auto-deploys from `main`.** The build runs `prisma generate && next build` — it does **NOT** run migrations.
- **Prod migrations are applied out-of-band via the Supabase MCP** (`apply_migration`), with byte-identical SQL, then verified. **The #1 trap:** a code deploy can outrun an un-applied prod migration and 500 with `P2022 column … does not exist`. Before deploying, verify **every** local Prisma migration has a prod counterpart.
- **Never put the prod `DATABASE_URL` in `.env`/`.env.local`** — the Prisma CLI and `prisma/seed.ts` wipe-then-seed and would destroy live data. Local dev uses a Docker Postgres on port 5433.

---

## 3. What's built (current state)

Three surfaces on one Next.js 16 deployment. This is a *snapshot*; file-level detail is in `AGENTS.md` and the cited files.

### Doctor (passcode → `medspace_session`)
- **Today** (`src/app/page.tsx`) — high search box (⌘K), **In clinic now** (mirror of the queue), **Waiting on you** (overdue count → follow-ups), **Expected today**, **Recently seen**.
- **Patient chart** (`src/app/patients/[id]/page.tsx`) + the **memory card** (`Briefing.tsx`, `memory.ts`): headline, today's **check-in vitals** line (flagged if high/febrile), worst trends + sparklines, tagged **home-readings** strip, **plan-reply** line, active meds, editable sticky note.
- **Visit + prescription** (`VisitForm.tsx`, `createVisit`): one-tap **repeat last Rx**, drug autosuggest (learns via `Drug.useCount`), frequency/duration/lab/follow-up chips, **vitals pre-filled from the front-desk check-in**, `localStorage` draft recovery. Saving auto-clears the patient off the queue and supersedes stale lab orders.
- **Printable/shareable Rx** (`src/app/visits/[id]/rx/page.tsx`) — paper-styled sheet with letterhead, reg. no., QR-to-chart, print + WhatsApp share. Reached from a prominent **"View & print prescription"** button on the chart and per-visit Rx chips.
- **Follow-ups + drifter recall** (`followups/page.tsx`, `reach.ts`, `recall.ts`), **search** (`api/search`), **new/edit/merge** with duplicate-phone detection and the plan-**language** selector.

### Patient (`/p/<token>` link, or `/plan` after Google sign-in)
- **The plan** (`PlanView.tsx`): next visit, medicines, tests, reports, contact — rendered identically from either entry. Records real opens (`/p`), the pilot's core metric.
- **The link is a credential** (`patientLink.ts`): signed, 30-day, per-patient revocable via `linkVersion`; kind-discriminated so a cookie value can't be replayed as a URL.
- **Google identity** (`patientAccess.ts`, `auth/callback`): binds a durable account (one account → many household patients), born `pending` until the doctor confirms.
- **Follow-up reply** (coming/booked/not_coming) and **home readings** (BP/sugar/weight, kept off the clinical trend).
- **Hindi plan** (`planText.ts`, `dosage.ts`, `PlanLangToggle`): the doctor sets a per-patient language once; the plan opens in it (EN/हिं toggle too). **Translated:** UI, dose timings (`1-0-1`→"सुबह और रात"), durations, common instructions. **Not translated (by design):** drug names, free-text advice, uncommon custom instructions.

### Staff — "clinic staff" = front desk **and** nurse (`MEDSPACE_STAFF_PASSCODE` → `medspace_staff`, `/queue` only)
- **Walk-in queue** (`queue/page.tsx`) — check-in by search-or-register (`QueueDesk.tsx`), captures name/phone/age/sex/reason, warns on duplicate phone.
- **Nurse vitals per waiting patient** (`QueueVitals.tsx`, `setQueueVitals`) — BP/pulse/weight/temp recorded while the patient waits; they flow to the doctor's memory card and pre-fill the visit form.
- Strict isolation: staff can reach only `/queue`; staff-safe search returns **no clinical data**.

### Platform
- Next.js 16 (App Router, Turbopack) · Tailwind v4 · Prisma 7 (pg adapter, client in `src/generated/prisma`) · Supabase (prod Postgres + Google IdP) · Vercel.
- **14 tables**, deny-all RLS **and** revoked anon/authenticated grants (belt-and-suspenders; app reads via Prisma as owner). See `AGENTS.md` § Databases.
- **Auth** (`auth.ts`): HMAC session with the **role baked into the signed payload** (a staff cookie can't satisfy a doctor check), **7-day** lifetime, fail-closed secret; login throttle keyed on the trusted platform IP.
- **Security**: route-handler self-auth, CSP + HSTS + Referrer-Policy, patient-token-in-URL never leaked. A full adversarial audit was done (commit `9d405fe`); posture documented in `AGENTS.md`.
- **8 test suites** (`scripts/test-*.ts`, plain `tsx`, no framework). `test-patient-link.ts` **must pass unmodified**. Reseed after the DB-touching ones.

---

## 4. What's next — exactly

### Go-live blockers (before real patients)
1. **Dedicated Google Cloud project + OAuth consent screen.** Prod currently borrows another product's ("Leetify") OAuth client — data-isolated, but the consent screen shows the wrong name. Create a medSpace project, set External user type, **publish to production** (Testing mode caps 100 users and expires consent in 7 days).
2. **Wipe the 8 fictional demo patients from prod** before real data lands (the DELETE block atop `scripts/seed-sql.ts`).
3. Confirm all env vars are set in Vercel — including `MEDSPACE_STAFF_PASSCODE` (already set: the staff card shows in prod) and `MEDSPACE_SITE_URL` matching Supabase's redirect allow-list.

### Strong candidate features (offered to the user; not yet built)
These came up in a capability discussion; the user chose vitals + Hindi first and these remain the best next bets (all reuse existing infra, none are bloat):
- **Medical certificates / letters** — sick-leave / fitness / referral, generated from the chart on the clinic letterhead, print + WhatsApp share (reuses the Rx print/share). *The biggest genuine gap* — a daily OPD request that currently forces the doctor out of the app.
- **Rx protocols / saved sets** — save a named med set ("Fever pack", "DM starter") and insert in one tap; speeds prescribing for *new* patients (repeat-Rx only helps returning ones). DocOn's proven time-saver. Extends the visit form, no new module.

### Known gaps / partial features (fix when relevant)
- **Phone normalisation on write** — phones are stored exactly as typed, so search-by-phone and duplicate detection miss formatted numbers. A `normaliseIndianMobile` helper exists (`src/lib/phone.ts`) but is used only for `wa.me`/`tel:` links. Fix: normalise on write.
- **Free-typed drugs don't become future suggestions** — only the seeded formulary is re-ranked by `useCount`; a "+ Add '<name>'" drug is stored on the item only.
- **Demographics edit form lacks draft recovery** (VisitForm/ReportForm have it).
- **Hindi**: free-text advice isn't machine-translated (deterministic path, no LLM). The i18n structure (`planText.ts` + `dosage.ts`) cleanly supports adding more languages if needed.
- By-design quirks not to "fix": "Recently seen" is really recently-*modified*; "overdue" is counted two ways on Today vs `/followups`; the Prisma vs Supabase migration ledgers diverge intentionally.

### Deferred (single-clinic pilot doesn't need them yet)
- **View Transitions API** for shared-element/cross-fade continuity between screens (deferred as experimental in Next 16; the motion layer is CSS-based and solid without it).
- Per-patient ownership check on `/api/reports/[id]/file`; magic-byte upload sniffing; on-demand plan-token minting. All low-risk for one clinic.
- Larger/speculative (don't start without a decision): offline reads (service worker + sync), OCR of report photos.

### Operational trap to re-check on every deploy
Verify **every** local Prisma migration has a prod counterpart (Supabase MCP `list_migrations` / the `pg_class`+`role_table_grants` check). A prior deploy 500'd on `P2022 column … does not exist` because migrations were applied locally but never to prod.

---

## 5. How to work

- **Dev:** local Docker Postgres on `:5433`; `pnpm dev`. Full quick-start in `README.md`.
- **Commands:** `pnpm dev` · `npx next build` · `npx tsc --noEmit` · `npx prisma migrate dev --name <x>` (local) · `npx tsx prisma/seed.ts` (reseed) · `npx tsx scripts/test-*.ts` (reseed after).
- **Prod schema changes:** write the Prisma migration, apply locally, then apply the *same SQL* to prod via the Supabase MCP `apply_migration` (project ref `exzxjsdifcssyvtglhfu`). New tables **must** hand-append the guarded `ENABLE ROW LEVEL SECURITY` + `REVOKE … FROM anon, authenticated` (see `AGENTS.md`).
- **Deploy:** commit to `main` → Vercel builds. Then verify prod is healthy (headers/behaviour) since the connector for Vercel is a *different* account and can't see this project.
- **The docs:** this file (strategy + state + next) → [`AGENTS.md`](AGENTS.md) (technical ground truth, traps) → [`README.md`](README.md) (intro + setup). `CLAUDE.md` imports this file and `AGENTS.md` so a fresh session loads both.

**Repo:** `github.com/Algorhythmicss/medspace` (private) · **Live:** `medspace-nu.vercel.app` · **Prod DB:** Supabase `medspace` / `exzxjsdifcssyvtglhfu` (ap-south-1).
