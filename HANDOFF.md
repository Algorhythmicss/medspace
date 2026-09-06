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
- **Visit + prescription** (`VisitForm.tsx`, `createVisit`): one-tap **repeat last Rx** plus clinic-wide **saved prescription sets**, drug autosuggest (learns via `Drug.useCount`), frequency/duration/lab/follow-up chips, **vitals pre-filled from the front-desk check-in**, `localStorage` draft recovery. The entire save is atomic: chart, observations, prescription, tasks, queue and drug memory commit together.
- **Printable/shareable Rx** (`src/app/visits/[id]/rx/page.tsx`) — paper-styled sheet with letterhead, reg. no., QR-to-chart, print + WhatsApp share. Reached from a prominent **"View & print prescription"** button on the chart and per-visit Rx chips.
- **Medical documents** (`src/app/patients/[id]/documents/new`, `src/app/documents/[id]`) — doctor-reviewed sick-leave, fitness, referral and freeform medical letters, optionally anchored to a visit, issued immutably on clinic letterhead with print + WhatsApp share.
- **Follow-ups + drifter recall** (`followups/page.tsx`, `reach.ts`, `recall.ts`), **search** (`api/search`), **new/edit/merge** with duplicate-phone detection and the plan-**language** selector.

### Patient (`/p/<token>` link, or `/plan` after Google sign-in)
- **The plan** (`PlanView.tsx`): next visit, medicines, tests, reports, contact — rendered identically from either entry. Records real opens (`/p`), the pilot's core metric. A patient can stage older history only after explicit ownership/care-use consent; nothing becomes clinical truth until doctor review.
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
- **17 tables**, deny-all RLS **and** revoked anon/authenticated grants (belt-and-suspenders; app reads via Prisma as owner). See `AGENTS.md` § Databases.
- **Auth** (`auth.ts`): HMAC session with the **role baked into the signed payload** (a staff cookie can't satisfy a doctor check), **7-day** lifetime, fail-closed secret; login throttle keyed on the trusted platform IP.
- **Security**: route-handler self-auth, CSP + HSTS + Referrer-Policy, patient-token-in-URL never leaked. A full adversarial audit was done (commit `9d405fe`); posture documented in `AGENTS.md`.
- **14 test suites** (`scripts/test-*.ts`, plain `tsx`, no framework), including Phase 1 validation/database invariants. `test-patient-link.ts` **must pass unmodified**. Run DB tests only on a disposable local database. `test-seed-parity.ts` guards the two seed scripts against drifting apart — the failure that went unnoticed for a week.

---

## 4. What's next — exactly

### Go-live blockers (before real patients)
1. **Verify the dedicated Google OAuth project for production.** The app now has its own Google Cloud OAuth project (user-confirmed 6 Sep 2026). Before real patients, confirm the consent screen shows MedSpace, the user type is External, publishing status is Production, and the Supabase callback URI is registered; the repository cannot prove console-side settings.
2. **Clear the fictional data from prod** before real data lands. Verified on prod 9 Aug 2026 — it is more than the patient list:
   - **11 patients**, not 8: fileNumbers 101–109 (the seeded panel, incl. the drifter Geeta Rao) plus **110 and 111, both named "ayush"** — throwaway walk-ins left over from queue testing.
   - **The `Clinic` row is fictional** — "Shri Krishna Clinic" / "Dr. A. K. Verma" / regNumber **`MCI-45821`**. That reg number prints on every prescription and is legally mandatory, so this is arguably the most urgent item here, not the patients. Insert the real clinic row before anything prints an Rx.
   - **Patient 101 carries a live `PatientAccess` row** — a real Google account bound to a fictional patient during the 1 Aug auth bring-up. Remove it.
   - Use only the **DELETE half** of the block atop `scripts/seed-sql.ts`: that script emits wipe *and reseed*, so running it whole just replaces the demo panel with a fresh one — and its wipe includes `DELETE FROM "Clinic"`, which drops the letterhead too.
3. Confirm all env vars are set in Vercel — including `MEDSPACE_STAFF_PASSCODE` (already set: the staff card shows in prod) and `MEDSPACE_SITE_URL` matching Supabase's redirect allow-list.

### Phase 1 additions completed (6 Sep 2026)
- **Production schema is current through Phase 1.** `20260906120000_phase_one_documents_and_rx_sets` was applied and reconciled into `supabase_migrations.schema_migrations` on 6 Sep 2026. Its single stored statement is byte-identical to the 2,841-byte checked-in migration. All three tables exist with RLS enabled, zero policies, zero `anon`/`authenticated` grants, the expected indexes, and the expected three foreign keys.
- **Medical certificates / letters** — sick-leave, fitness, referral and medical letters from the chart, with reviewed wording, optional visit linkage, clinic letterhead, print and WhatsApp share.
- **Rx protocols / saved sets** — named medicine/advice/test/follow-up sets insert in one tap, remain fully editable, and deliberately exclude patient complaint/diagnosis.
- **Interrupted-work recovery** — patient demographics and document drafts now recover alongside visit/report drafts; successful redirects cannot leave a stale draft, and discarding a visit draft preserves front-desk vitals.
- **Visit integrity** — server-side bounds reject implausible vitals/untrusted oversized payloads and a transaction commits all visit side effects together.

### Known gaps / partial features (fix when relevant)
- ~~Phone normalisation on write~~ — **fixed 11 Aug 2026.** Mobiles are stored canonical and queries are reduced the same way, so search and duplicate detection no longer miss formatted numbers; non-mobiles are still kept as typed.
- ~~Free-typed drugs don't become future suggestions~~ — **fixed 11 Aug 2026.** `createVisit` upserts the drug, so the autosuggest learns what this doctor actually prescribes instead of only re-ranking the seed.
- ~~Demographics edit form lacks draft recovery~~ — **fixed 6 Sep 2026.** `PatientDetailsForm` restores/discards unsaved edits and clears the copy only after a successful redirect.
- **Hindi**: free-text advice isn't machine-translated (deterministic path, no LLM). The i18n structure (`planText.ts` + `dosage.ts`) cleanly supports adding more languages if needed.
- By-design quirks not to "fix": "overdue" is counted two ways on Today vs `/followups`; the Prisma vs Supabase migration ledgers diverge intentionally. "Recently seen" now deliberately deduplicates newest-first visit rows and shows the latest visit, not the oldest duplicate in the query window.

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
