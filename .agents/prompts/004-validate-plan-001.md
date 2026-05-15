# Prompt for Claude Code agent — Validate PLAN-001 (against VALIDATION-001)

You are a fresh Claude Code agent. You have no prior conversation context. Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js + tRPC + Drizzle + Postgres + Better Auth + shadcn/ui + Playwright; self-hosted on `haynes-ops`). Launch chapter: Sigma Phi Omicron, UMass Lowell. The docs-first SDLC pairs every implementation plan (`PLAN-NNN`) with a validation plan (`VALIDATION-NNN`); your job is the validation half.

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Execute `docs/plans/001-project-scaffolding-validation.md`'s §6 pass/fail gates against the PLAN-001 commit on the current branch. PLAN-001 has already been implemented; you do not write source code. You run the gates, confirm each is green, and report. If a gate fails, you do **not** relax it — you either fix the implementation (small, mechanical fixes only — e.g., a missing dev-dep, a typo) or escalate.

## What to read FIRST (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory.
2. `docs/plans/001-project-scaffolding-validation.md` — the validation contract. §3 is the coverage matrix; §4 names the unit tests; §6 is the gate checklist.
3. `docs/plans/001-project-scaffolding.md` §5 + §9 — the plan-level verification and the expected commit shape.
4. `git log -1` — confirm PLAN-001's commit exists on the current branch before starting.

## What you do NOT do

- Do not modify any doc under `docs/` (plans, PRDs, ADRs, designs).
- Do not relax a gate to "make it pass." If a gate fails: small mechanical fixes to the implementation are OK (missing dep, wrong path, typo); anything bigger → **escalate to the user**.
- Do not skip ahead into PLAN-002+ scope (no schemas, no procedures, no business logic).
- Do not amend PLAN-001's commit. If an implementation fix is needed, create a **new** commit (`fix(scaffolding): <what>`).
- Do not push to remote — the user pushes.

## Definition of done

Every box in VALIDATION-001 §6 green, verified by running the commands:

- [ ] `pnpm install` exit code 0.
- [ ] `pnpm typecheck` exit code 0.
- [ ] `pnpm lint` exit code 0.
- [ ] `pnpm test` exit code 0 — testcontainers PG16 smoke test passes (per ADR-004 test-DB rule; no SQLite or MySQL substitution).
- [ ] `pnpm --filter web build` exit code 0.
- [ ] `pnpm --filter web dev` boots; `curl -sS -o /dev/null -w '%{http_code}' http://localhost:3000/` returns `200`; `curl -sS -X POST -o /dev/null -w '%{http_code}' http://localhost:3000/api/auth/sign-in/email` returns a 4xx (Better Auth missing-credentials response); `curl -sS -o /dev/null -w '%{http_code}' http://localhost:3000/api/trpc/x` returns `404`.
- [ ] PLAN-001's commit is on the branch with the §9 message; no doc files modified.

Report back (under 200 words): which gates passed, any implementation fixes you made (with new commit hash), and anything escalated.

## If a gate fails

1. **Mechanical fix (allowed):** missing dev-dependency, path typo, wrong import — fix in the implementation, re-run the gate, create a new `fix(scaffolding): …` commit.
2. **Plan/validation ambiguity (escalate):** the plan says X but the design says Y, or VALIDATION-001 cites a file path that doesn't match what PLAN-001 produced — stop and ask the user with: (1) the gate that failed, (2) the exact mismatch, (3) your lean.
3. **Test reveals an upstream design problem (escalate):** do not edit the design — surface to the user.

## If you get stuck

Escalate with: gate name, exact error output, what you tried, your lean. Do not invent.

Begin.
