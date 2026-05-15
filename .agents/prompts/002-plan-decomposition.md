# Prompt for fresh Claude Code agent — Implementation-plan decomposition (Agent B)

> **You** are a fresh Claude Code agent ("Agent B"). **You have no prior conversation context** for this project — everything you need is in this file or in the files it points you at. Do **NOT** read this entire file aloud or restate it; just execute. Read the user's auto-memory at `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` first.

---

## 1. Project at a glance

- **Name:** TODOs for Dues — per-chapter SaaS for Greek-life chapters. Alumni post small jobs ("TODOs"); Actives claim them and earn dues credit; the chapter treasurer is paid via Venmo off-app and credits each Active off-app.
- **Launch chapter:** Sigma Phi Omicron, UMass Lowell.
- **Tech stack:** Next.js (App Router) + TypeScript + tRPC + Drizzle + Postgres + Better Auth + Resend + shadcn/ui + Playwright (E2E). Self-hosted on `haynes-ops` Kubernetes cluster.
- **Current state (as of 2026-05-14):** **Docs-only.** PRDs (001 overview + 002–008 per-capability + 009 Draft/blocked), ADRs (001–011), DDD walking-skeleton artifacts (DDD-001..004 + BCC-01/02 + ADC-01/02), designs (DESIGN-001..006), an existing initial plan set (PLAN-001..009), release manifest (REL-001 MVP) — all at status **Proposed**. **No code yet.**
- **Just completed:** A doc-review pass (`.agents/prompts/001-doc-review-and-plan-handoff.md`) ran 5 parallel review subagents. The user has already resolved every Class A precondition the review surfaced (state-naming normalization, `moderators_recipient_email` propagation across ADR-010 + PRD-007 + DESIGN-005, ADC-01 state-count fix, display-name R-NN added to PRD-003, audit-log writer consistency via DESIGN-002 §4.1.5 `recordRelationshipEvent()`, `chapter_settings` bootstrap migration in DESIGN-001 §5.5). **You do not need to flag those back — they are done.** The review's "Class B" plan-refinement items are now your job.

## 2. Your task

In one sentence: **decompose the project's designs into agent-executable implementation plans, each paired with a validation plan that proves the implementation satisfies the corresponding requirements.**

Concretely:

1. **Read the existing PLAN-001..PLAN-009.** They are a valid starting point but were drafted before the doc-review pass and before the user resolved the Class A items above. Treat them as a draft-quality first cut: refine, split, merge, or replace as the design now warrants.
2. **Decide the decomposition.** How many plans, in what order, with what scope? Optimize for *agent-executable* — an implementation agent should be able to read one plan cold and produce code without asking clarifying questions. Plans that span too much become unsteerable; plans that span too little churn the same files repeatedly. Use the design boundaries (DESIGN-001..006) and the bounded contexts (BCC-01/02/03) as the natural seams.
3. **Pair every implementation plan with a validation plan.** For each `PLAN-NNN-<topic>`, produce a sibling `VALIDATION-NNN-<topic>` that:
   - Lists every PRD R-NN + AC-NN and every DESIGN-§ the implementation plan claims to satisfy.
   - Specifies the unit tests (Vitest, against PG16 via testcontainers per ADR-004) that prove each requirement.
   - Specifies the Playwright tests (against a running dev server, using the `mcp__playwright__*` tools — already verified working on this workstation) that exercise each user-facing AC.
   - Has a pass/fail gate: every checkbox green = the implementation plan is **Done**. Anything red blocks the next plan.
4. **Produce a coverage matrix** at `docs/plans/COVERAGE.md` mapping every PRD-002..008 R-NN + AC-NN, every DESIGN-001..006 §4.* subsection, and every BCC-02 CMD-NN to (a) the implementation plan that builds it and (b) the validation plan that proves it. Anything not in MVP is marked "Deferred — REL-002+" with justification.
5. **Sanity-check the plan ordering** end-to-end: every plan's prerequisites are satisfied by an earlier plan; every validation plan's tests can run against the artifacts the implementation plan produces.

## 3. Specific decomposition guidance

The existing PLAN-001..PLAN-009 ordering is roughly correct for the walking skeleton: scaffolding → schema → FSM → auth → tRPC → UI → notifications → E2E test → deploy. But these plans **only cover the walking-skeleton subset** — the rest of MVP (Admin view, dispute UI, role-management UI, advanced-settings UI, the full tRPC procedure set, the full notification set including PRD-002 R-12 moderator-queue email) is unowned by any plan today. You decide whether to:

- **Extend the existing 9 plans** to cover the full MVP scope, or
- **Add new plans** (PLAN-010+) for the post-walking-skeleton MVP work, or
- **Split / re-shape** the existing plans if you find a cleaner cut (e.g., one plan per bounded context).

Whichever path you pick, justify it briefly in §1 of each modified or new plan. The goal is plans an agent can pick up and execute, not adherence to the existing structure.

### Required pairing pattern

For every implementation plan you ship, ship a paired validation plan. Suggested file naming:

```
docs/plans/
  010-mvp-ui-completion.md                      ← PLAN-010 (implementation)
  010-mvp-ui-completion-validation.md           ← VALIDATION-010 (paired tests)
  011-mvp-trpc-completion.md                    ← PLAN-011 (implementation)
  011-mvp-trpc-completion-validation.md         ← VALIDATION-011 (paired tests)
  ...
```

If you also touch existing PLAN-001..PLAN-009, create their corresponding `*-validation.md` siblings if they don't already exist. (The current plan set has no validation siblings — every existing plan needs one.)

### Validation plan shape (required)

Each validation plan must contain:

1. **§1 Goal** — "verify PLAN-NNN's implementation satisfies …"
2. **§2 Inputs** — (a) the implementation plan it pairs with; (b) the PRDs / designs whose requirements it tests against; (c) the running artifacts under test (e.g., "tRPC procedures from PLAN-005, served from `pnpm dev`").
3. **§3 Coverage matrix** — a table with one row per PRD R-NN + AC-NN + DESIGN-§ that the paired implementation plan claims to satisfy, mapping each to (a) the unit test file + test name and (b) the Playwright spec + test name.
4. **§4 Unit tests** — explicit test list, file paths, what each asserts. Use Vitest against PG16 via testcontainers per ADR-004's test-DB rule (no SQLite or MySQL substitution). Include the integration-test seam (e.g., "spin up testcontainers PG16, apply migrations from PLAN-002, seed users, assert FSM transition").
5. **§5 Playwright E2E tests** — explicit spec list, file paths, what each scenario clicks through. The implementation agent runs these via the `mcp__playwright__*` tools (already verified working) against a `pnpm dev` server at `http://localhost:3000`. Each spec maps to one or more PRD AC-NN.
6. **§6 Pass/fail gates** — explicit checklist. Every box must be green for the paired implementation plan to be marked Done. If a test fails, the implementation agent fixes the implementation (not the test) and re-runs. If a test reveals an upstream design ambiguity, escalate to the user — do not edit the design without authorization.
7. **§7 Resume notes** — how to pick up if the validation pass is interrupted (which tests already passed).
8. **§8 Changelog** — append-only.

### Implementation plan shape (existing template)

Use `docs/plans/000-template.md` for new implementation plans. The required shape is unchanged from the existing PLAN-001..PLAN-009 (see §5 below for the section list). The only addition: every implementation plan's frontmatter `related.plans` must list its paired validation plan as a `lateral` (not prerequisite — the validation runs *after* the implementation).

## 4. What to read first (in order)

In this order — earlier files give context for later ones:

1. **`/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md`** — the user's auto-memory. Captures durable preferences: ask-don't-invent, one-question-at-a-time on contested decisions, brief responses, doc conventions, MVP-is-a-phase (not a single PRD), skip-confirm-when-recommendation-is-strong.
2. **`docs/PROCESS.md`** — the docs-first SDLC.
3. **`docs/releases/001-mvp.md`** — REL-001 MVP scope statement. Defines the ship gate.
4. **`docs/prds/001-todos-for-dues-overview.md`** — capability-level R-NN (R-01..R-16). All resolved Q-NN are marked ✅ in §9.
5. **`docs/prds/000-template.md`** — the revised PRD template (PRDs 002, 004–008 follow this; PRD-001 + PRD-003 stay legacy).
6. **`docs/prds/002-job-posting-and-moderation.md` … `008-role-management.md`** — per-capability PRDs. Skip 009 (intentionally Draft, blocked on PRD-001 Q-07).
7. **`docs/prds/003-identity-and-access.md`** — paired with ADR-002, ADR-007, ADR-011. Note **R-10 + AC-08 + AC-09 (display-name capture)** added 2026-05-14 — every plan that touches signup or SSO first-login must honour this.
8. **`docs/adrs/001-web-framework.md` … `011-role-partition-in-better-auth.md`** — all 11 ADRs. Most load-bearing for plan decomposition: **ADR-008** (FSM), **ADR-009** (audit-log shape + retention), **ADR-010** (per-instance settings — note the **5-key MVP list** post-2026-05-14: `admin_recipient_email`, `treasurer_recipient_email`, `moderators_recipient_email`, `chapter_timezone`, `chapter_display_name`), **ADR-011** (role partition + min-Admin trigger).
9. **`docs/domain-driven-design/README.md`** — DDD modelling sequence + ID conventions.
10. **`docs/domain-driven-design/001-ddd-active-walking-skeleton.md` + `002-ddd-alumni-walking-skeleton.md`** — persona walking-skeleton timelines + Mermaid sequence diagrams (the fastest read of the full job loop).
11. **`docs/domain-driven-design/004-bounded-contexts.md`** — context catalog. The 3 BCs (Identity & Access, Job Lifecycle, Role Management) are natural decomposition seams.
12. **`docs/domain-driven-design/bounded-contexts/001..002-*.md`** — BCC-01 + BCC-02. **BCC-02 §7.1** is the authoritative 16-command list (CMD-14 split a/b/c into CMD-14a/b/c).
13. **`docs/domain-driven-design/aggregates/001-job-aggregate-canvas.md`** — **ADC-01, the most load-bearing doc.** 17 ST-NN transitions, 15 INV-NN invariants. Every plan that touches the Job aggregate traces back here.
14. **`docs/domain-driven-design/aggregates/002-user-aggregate-canvas.md`** — ADC-02.
15. **`docs/domain-driven-design/003-ubiquitous-language.md`** — T-NN glossary.
16. **`docs/designs/001-database-schema.md`** — DESIGN-001. Note **§4.1 snake_case ↔ hyphenated normalization rule**, **§5.5 `chapter_settings` bootstrap migration** (added 2026-05-14).
17. **`docs/designs/002-fsm-module.md`** — DESIGN-002. Note **§4.1.3 `createJob.afterCommit` parameter** (added) and **§4.1.5 `recordRelationshipEvent()` helper** (added) — these are the canonical writers; nothing else writes `job_state_transitions`.
18. **`docs/designs/003-trpc-api-surface.md`** — DESIGN-003. The 5 routers (`jobs`, `users`, `settings`, `admin`, `invites`) are a natural seam if you choose to split tRPC plans.
19. **`docs/designs/004-auth-wiring.md`** — DESIGN-004.
20. **`docs/designs/005-notifications-adapter.md`** — DESIGN-005. Note §4.4 `sendModeratorQueueEmail()` is now a real spec (not a sketch).
21. **`docs/designs/006-ui-components.md`** — DESIGN-006. Note **§4.6 `stateDisplayName()` formatter** (added 2026-05-14) is the single conversion point between code (snake_case) and PRD-001 R-07 display form.
22. **`docs/plans/000-template.md`** — plan template.
23. **`docs/plans/001-project-scaffolding.md` … `009-deploy-prototype.md`** — all 9 existing plans. Read in order. These are the draft you refine.

## 5. Implementation plan template (recap)

For new implementation plans, use `docs/plans/000-template.md`. Required sections:

- Frontmatter: `id` (PLAN-NNN), `title`, `status` (Proposed for new plans), `author`, `created`, `last_updated`, `related: { prds, adrs, designs, plans { prerequisite, lateral } }`.
- **§1 Goal** — one sentence; the deliverable. Justify the decomposition in one extra sentence ("split from PLAN-005 because …").
- **§2 Inputs** — documents the agent must read first (cite specific files + sections).
- **§3 Outputs** — files created/modified, contracts established.
- **§4 Steps** — numbered, ordered. Each step has: action, files touched, code/CLI sketch where useful, **Verification** (typecheck passes, test passes, query returns expected), **Resume** (how to pick up if killed mid-step).
- **§5 Verification** — overall plan-level verification: "VALIDATION-NNN passes."
- **§6 Out of scope** — explicit non-goals; what other plan owns each.
- **§7 Risks** — 1–3 known risks with mitigations.
- **§8 Open questions** — Q-PLN-NN with status (Open / Resolved / Deferred).
- **§9 Changelog** — append-only.

Plans must be **agent-executable**: an implementation agent reads cold and produces code without asking. Where ambiguity exists, the plan resolves it (cite the design subsection, name the file path, sketch the function signature) — does not punt.

## 6. Definition of done

You're done when **all** of the following hold:

- [ ] Every PRD-002..008 R-NN has at least one implementation plan step that builds it.
- [ ] Every PRD-002..008 AC-NN has at least one validation plan test that proves it (unit OR Playwright; some need both).
- [ ] Every DESIGN-001..006 §4.* subsection has either an implementation plan step or an explicit "Deferred — REL-NNN" entry in COVERAGE.md with justification.
- [ ] Every BCC-02 §7.1 CMD-NN (16 commands incl. CMD-14a/b/c) has an implementation plan step + validation plan test.
- [ ] Every implementation plan has a paired `*-validation.md` sibling.
- [ ] `docs/plans/COVERAGE.md` exists and the matrix has zero un-mapped MVP rows.
- [ ] Plan ordering DAG is sane: every `related.plans.prerequisite` resolves to an earlier plan; the walking-skeleton E2E test (currently PLAN-008) is reachable; the deploy plan (currently PLAN-009) is terminal.
- [ ] Every modified or new plan has an appended changelog entry and bumped `last_updated`. Status remains Proposed.
- [ ] Validation plans cite real test file paths under `apps/web/__tests__/`, `packages/*/__tests__/`, and `apps/web/e2e/` (Playwright) — even though the files don't exist yet, the validation plan is the contract that the implementation agent + test agent will create them.
- [ ] No upstream document (PRD / ADR / DDD / design / release manifest) was modified by you.

## 7. What you do NOT do

- Do **not** write code.
- Do **not** modify PRDs, ADRs, DDD artifacts, designs, or the release manifest. If a design ambiguity blocks plan decomposition, raise it to the user with: (1) what's ambiguous, (2) which plan it blocks, (3) your lean. Do not invent a design decision.
- Do **not** run any commands beyond reading files and writing inside `docs/plans/`.
- Do **not** promote any doc's `status`.
- Do **not** spawn implementation agents.
- Do **not** create new memory files.
- Do **not** worry about Class A preconditions from the doc-review pass — the user resolved them already (see §1's "Just completed" bullet).

## 8. Output

- Edits to existing plans `docs/plans/001-…md` … `docs/plans/009-…md` where you refine scope, add the validation-plan reference to frontmatter, or split.
- New implementation plans for any MVP work the existing 9 don't cover. File naming: `docs/plans/010-<topic>.md`, `011-<topic>.md`, etc.
- New validation plan for **every** implementation plan (existing + new). File naming: `docs/plans/NNN-<topic>-validation.md` paired 1-to-1.
- New file: **`docs/plans/COVERAGE.md`** — the coverage matrix.
- A short report-back to whoever invoked you summarising:
  1. The post-decomposition plan ordering DAG (one line per plan).
  2. Any design ambiguities you escalated to the user (file path + lean).
  3. Coverage gaps you couldn't close (with reason).

Keep the report-back ~250 words. The user prefers brief, direct responses (see `feedback_brief_responses.md` in their memory).

## 9. Conventions to honour

- **Stable IDs, never renumber.** PRD-NN, ADR-NN, DDD-NN, BCC-NN, ADC-NN, DESIGN-NN, PLAN-NN at file level; R-NN, US-NN, AC-NN, Q-NN, ST-NN, INV-NN, CMD-NN, EVT-NN, T-NN, BR-NN inside files. Cross-doc references use `<DocID> <InnerID>` (e.g., `PRD-002 R-12`, `ADC-01 INV-10`, `DESIGN-002 §4.1.5`).
- **3-digit numbering.** `010-mvp-ui-completion.md`, not `0010-…md`.
- **Status lifecycle:** Draft → Proposed → Accepted → Superseded by/Deprecated. Accepted is immutable; supersede via new doc. **You leave plans at Proposed.**
- **Append-only changelogs.** Never edit prior entries. Append a row to §9 of every modified plan: `| 2026-05-14 | Tom Haynes | <change> |`.
- **Per-plan §2 Inputs cites specific upstream sections**, not whole files. E.g., `docs/designs/002-fsm-module.md §4.1.5 (recordRelationshipEvent helper)`, not `docs/designs/002-fsm-module.md`.
- **Test-DB rule.** Tests use the same Postgres engine as prod. Testcontainers spin up PG16 in CI and locally. **No SQLite or MySQL substitution.** Validation plans must say so explicitly.
- **Playwright over the MCP.** Implementation + test agents have `mcp__playwright__*` tools available (verified working on this workstation as of 2026-05-14). Validation plans should call out Playwright spec file paths so test agents know where to write them.
- **Memory-first context.** Read the user's memory file before starting.
- **Ask, don't invent.** When a detail is unknown — design intent, scope call, test gating — pause and ask rather than fabricating. Reasonable defaults in plans are fine (file paths, helper names) when grounded in the designs. Anything resembling a product or scope decision goes to the user.

## 10. Practical tips

- The 17 ST-NN transitions in ADC-01 §6 are the canonical command list. Walk through them once to size the FSM-implementation plan.
- The 15 INV-NN invariants in ADC-01 §4 are where most "did the plan miss something" issues hide. Every invariant should be enforced somewhere (DB CHECK in DESIGN-001, FSM guard in DESIGN-002, RPC validator in DESIGN-003) — verify the corresponding plan covers that enforcement and the validation plan tests it.
- DESIGN-006 §3 + §4.3 list every UI component the MVP needs. The walking-skeleton subset in §4.2 is **only** the happy-path slice — the Admin view, dispute UI, role-management UI, and advanced-settings UI are not covered by PLAN-006 today.
- DESIGN-003 §4.1..§4.7 list every tRPC procedure across the 5 routers. PLAN-005 today claims "all 5 routers" but PLAN-008's E2E test never exercises `admin.*` or `users.changeRole` — clarify scope and reflect in validation.
- The walking-skeleton subset, per `docs/domain-driven-design/README.md`, is intentionally minimal. PLAN-006 + PLAN-008 should match that spirit; the rest of MVP is what your new plans cover.
- The user prefers terse, direct responses. Your final report-back should be ~250 words.
- Playwright MCP is verified working — don't re-validate it; just cite it as available in the validation plans.

## 11. If you get stuck

If a design contradicts itself in a way you can't resolve **and** the contradiction prevents a plan or validation step, **escalate to the user** with: (1) what you found, (2) why it blocks, (3) what decision you need. Don't invent product or design decisions.

If the existing plan structure is so off from the designs that minor refinement won't suffice, propose a re-shape (e.g., "split PLAN-005 into PLAN-005a tRPC walking-skeleton + PLAN-011 tRPC MVP-rest") and proceed once the user confirms.

---

**Begin.** Read the user's memory at `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md`, then `docs/PROCESS.md`, then proceed.
