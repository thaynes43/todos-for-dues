# Prompt for Claude Code agent — Execute PLAN-001 (project scaffolding)

You are a fresh Claude Code agent. You have no prior conversation context. Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters. Alumni post small jobs ("TODOs"); Actives claim them and earn dues credit. Tech stack: Next.js (App Router) + TypeScript + tRPC + Drizzle + Postgres + Better Auth + Resend + shadcn/ui + Playwright. Self-hosted on `haynes-ops` Kubernetes cluster. Launch chapter: Sigma Phi Omicron, UMass Lowell. **Current state:** docs-only — no code yet. PLAN-001 is the first code-producing plan.

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Execute `docs/plans/001-project-scaffolding.md` end-to-end, then verify against the pass/fail gates in `docs/plans/001-project-scaffolding-validation.md`. You produce a runnable-but-inert app scaffold: Next.js App Router + pnpm workspaces + Drizzle + Better Auth + tRPC, all wired but with **no business logic**. Walking skeleton and MVP work land in PLAN-002 onward — not yours.

## What to read FIRST (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory. Honour every feedback memory (ask-don't-invent, brief responses, doc conventions, skip-confirm-when-strong, etc.).
2. `docs/plans/001-project-scaffolding.md` — the plan. §4 has ordered steps; §5 is plan-level verification; §8 has resume points if interrupted.
3. `docs/plans/001-project-scaffolding-validation.md` — the validation gates you must satisfy.
4. PLAN-001's §2.1 cited reading — only the specific ADR / DESIGN §3 folder-layout sections cited, not whole docs.

## What you do NOT do

- Do not modify anything under `docs/` (PRDs, ADRs, designs, plans, DDD, releases). If a plan step contradicts a design, **escalate to the user** — do not improvise.
- Do not skip ahead into PLAN-002+ scope (no real schemas, no procedures, no auth plugins, no UI beyond the placeholder).
- Do not write business logic.
- Do not commit until §5 + VALIDATION-001 §6 gates are all green.
- Do not push to remote — the user pushes.

## Definition of done

Every box in VALIDATION-001 §6 green:
- `pnpm install`, `pnpm typecheck`, `pnpm lint` succeed.
- `pnpm test` passes the testcontainers smoke test (PG16 — no SQLite substitution per ADR-004).
- `pnpm --filter web build` succeeds.
- `pnpm --filter web dev` boots; placeholder home renders; `/api/auth/sign-in/email` returns a Better Auth 4xx; `/api/trpc/*` returns 404 (empty router).
- One commit on the current branch matching PLAN-001 §9's commit message.

Then report back (under 200 words): commit hash, anything escalated, any open Q-PLN-NN with your lean.

## If you get stuck

If a step's verification fails AND it's not obviously a copy-paste fix in your code, **escalate to the user** with: (1) which step, (2) the exact error, (3) what you tried, (4) your lean. Do not invent product or architectural decisions.

Begin.
