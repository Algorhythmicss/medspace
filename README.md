# medSpace

A memory-first clinic OS for Indian private OPD. It enters a clinic as a *faster* way to run a consult than paper, and earns retention by accumulating a patient's memory across visits — then closes the follow-up loop by giving the patient their own live care plan.

- **Doctor side** — instant patient lookup, a ≤5-line "memory card" that surfaces what changed since last time, and a repeat prescription in one tap.
- **Patient side** — after each visit the doctor sends a private WhatsApp link; the patient taps it to see their medicines, tests and next visit. They can link Google once so they never need the link again.

> Single-clinic by design. Strategy and field research: [`../research/virtual-observation-day.md`](../research/virtual-observation-day.md).

## For engineers / agents

**[`AGENTS.md`](AGENTS.md) is the ground truth** — architecture, data model, auth, the design system, security posture, and the traps that have cost time. Read it before making changes. (`CLAUDE.md` just imports it.)

## Quick start

```bash
# 1. Local Postgres in Docker (never point local tooling at production)
docker run -d --name medspace-pg -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=medspace -p 5433:5432 postgres:17

# 2. Env — copy the template and fill it in (.env and .env.local both hold the container URL)
cp .env.example .env.local

# 3. Install, migrate, seed the demo panel
pnpm install
npx prisma migrate deploy
npx tsx prisma/seed.ts

# 4. Run
pnpm dev   # http://localhost:3000
```

Dev clinic passcode is whatever you set as `MEDSPACE_PASSCODE`. See [`.env.example`](.env.example) for all seven required variables.

## Commands

| | |
|---|---|
| `pnpm dev` | Dev server |
| `npx next build` | Production build |
| `npx tsc --noEmit` | Typecheck |
| `npx prisma migrate deploy` | Apply migrations |
| `npx tsx prisma/seed.ts` | Reseed the demo panel |
| `npx tsx scripts/test-*.ts` | Test suites (reseed after — they touch the DB) |

## Stack

Next.js 16 (App Router, Turbopack) · Tailwind v4 · Prisma 7 (Postgres driver adapter) · Supabase (Postgres in production + Google identity provider) · deployed on Vercel.

## Architecture at a glance

- One deployment, two audiences: doctor (passcode-gated) and patient (`/p/<token>` link or `/plan` after Google sign-in). The gate lives in `src/proxy.ts`.
- The **memory card** (`src/lib/memory.ts`) is deterministic — no LLM. The craft is deletion: at most five lines, absorbable in a glance.
- The **patient link is a credential** — signed, expiring, per-patient revocable (`src/lib/patientLink.ts`). Google sign-in binds a durable identity, doctor-confirmed on the chart.
- Attachments live in Postgres behind the auth gate; RLS is deny-all so the public Supabase key reads nothing.

Full detail — including the security posture and the reasoning behind each choice — is in [`AGENTS.md`](AGENTS.md).
