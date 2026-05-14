# Prompt for fresh Claude Code agent — Doc-review pass + plan-handoff prompt generation

> **You** are a fresh Claude Code agent. **Do NOT** read this entire file aloud or restate it back to the user; just execute. **You have no prior conversation context** for this project — everything you need to know is in this file or in the files it points you at.

---

## 1. Project at a glance

- **Name:** TODOs for Dues — per-chapter SaaS for Greek-life chapters. Alumni post small jobs ("TODOs"); Actives claim them and earn dues credit; chapter treasurer collects via Venmo and credits each Active off-app.
- **Launch chapter:** Sigma Phi Omicron, UMass Lowell.
- **Tech stack:** Next.js (App Router) + TypeScript + tRPC + Drizzle + Postgres + Better Auth + Resend + shadcn/ui. Self-hosted on `haynes-ops` Kubernetes cluster.
- **Current state (as of 2026-05-14):** **docs-only.** No code yet. We've completed every documentation phase short of "agent writes code":
  - PRDs (001 overview + 002–008 per-capability + 009 communication-channel-blocked)
  - ADRs (001–011)
  - DDD walking-skeleton artifacts (DDD-001..004 + BCC-01/02 + ADC-01/02)
  - Designs (DESIGN-001..006)
  - Plans (PLAN-001..009)
  - Release manifest (REL-001 MVP)
- All substantive docs were promoted from Draft to **Proposed** in the same commit that created this prompt file. Two docs remain Draft: PRD-009 (blocked on Q-07) and ADR-008..011 internals (these are already Proposed).

## 2. Your task

You will:

1. **Spawn parallel subagents** to review the documentation for **gaps** and **continuity issues**.
2. **Synthesise their findings** into one ranked list (high → low impact).
3. **Produce a single output: a new prompt file** at `.agents/prompts/002-plan-decomposition.md` that briefs **a different fresh agent (Agent B)** on how to take the designs and produce plans suitable for implementation agents — informed by your findings. Agent B will not have your context either.

**You do NOT modify the source docs.** You read, analyse, and produce the next prompt. If you identify must-fix gaps, list them in your output prompt as preconditions Agent B must address before proceeding (or, if a gap is critical enough to block plan generation, raise it back to the user as a blocker rather than producing Prompt-2).

**You do NOT execute Phase 6 (writing code) yourself.** Plan generation is Agent B's job; code execution is the agent after that.

## 3. What to read first (in order)

In this order — earlier files give context for later ones:

1. **`docs/PROCESS.md`** — the docs-first SDLC the project follows.
2. **`.agents/HANDOFF.md`** — agent-handoff notes from the original agent. Some bits are stale (it predates the doc explosion of 2026-05-14); cross-check against the docs themselves.
3. **`docs/prds/001-todos-for-dues-overview.md`** — overview PRD with all the capability-level R-NN. **The contract everything else cites.** Resolved questions are marked ✅ in §9.
4. **`docs/releases/001-mvp.md`** — the MVP release manifest listing which PRDs gate the MVP ship. Reference for "what's in scope."
5. **`docs/domain-driven-design/README.md`** — DDD modelling sequence + ID-prefix convention.
6. **`docs/domain-driven-design/001-ddd-active-walking-skeleton.md`** + **`002-ddd-alumni-walking-skeleton.md`** — the persona walking skeletons (event timelines + Mermaid sequence diagrams). The happy-path job loop end-to-end.
7. **`docs/domain-driven-design/004-bounded-contexts.md`** — the catalog of MVP bounded contexts + cross-cutting capabilities + reconciliation notes for the 5–7 candidate contexts the walking skeletons surfaced.
8. **`docs/prds/000-template.md`** — the **revised** PRD template (post-2026-05-14 research-driven revision). Note: PRD-001 + PRD-003 stay in **legacy form** (no backfill); other PRDs (002, 004–008) follow the revised template.
9. **`docs/adrs/000-template.md`** — MADR 3.0 + project frontmatter conventions for ADRs.
10. **`docs/designs/000-template.md`** + **`docs/plans/000-template.md`** — design + plan templates.

## 4. Doc inventory at a glance

```
docs/
  PROCESS.md
  prds/                                                 # capability + product-level requirements
    000-template.md
    001-todos-for-dues-overview.md   [Proposed]         # the overview; everything cites this
    002-job-posting-and-moderation.md  [Proposed]
    003-identity-and-access.md         [Proposed]       # legacy template form
    004-enrollment-lock-reschedule.md  [Proposed]
    005-completion-and-payment-sent.md [Proposed]
    006-loop-closure-and-dispute.md    [Proposed]
    007-admin-view-and-audit-log.md    [Proposed]
    008-role-management.md             [Proposed]
    009-communication-channel.md       [Draft — blocked on PRD-001 Q-07]
  adrs/                                                 # MADR 3.0 architecture decisions
    000-template.md
    001-web-framework.md      [Proposed]   002-auth.md            [Proposed]
    003-api-contract.md       [Proposed]   004-db-and-orm.md      [Proposed]
    005-email.md              [Proposed]   006-hosting.md         [Proposed]
    007-google-workspace-oidc.md [Proposed]
    008-job-state-machine.md  [Proposed]   009-audit-log-schema-and-retention.md [Proposed]
    010-per-instance-settings-storage.md [Proposed]
    011-role-partition-in-better-auth.md [Proposed]
  domain-driven-design/                                 # DDD walking-skeleton artifacts
    README.md
    000-template-event-storming.md
    000-template-bounded-context-canvas.md
    000-template-aggregate-design-canvas.md
    000-template-context-map.md
    001-ddd-active-walking-skeleton.md   [Proposed]
    002-ddd-alumni-walking-skeleton.md   [Proposed]
    003-ubiquitous-language.md           [Proposed]    # T-01..T-17 seeded from PRD-001 §11
    004-bounded-contexts.md              [Proposed]
    bounded-contexts/
      001-identity-and-access-canvas.md  [Proposed]    # BCC-01
      002-job-lifecycle-canvas.md        [Proposed]    # BCC-02 — central
    aggregates/
      001-job-aggregate-canvas.md        [Proposed]    # ADC-01
      002-user-aggregate-canvas.md       [Proposed]    # ADC-02
  designs/                                              # detailed software design
    000-template.md
    001-database-schema.md       [Proposed]            # DESIGN-001 — Drizzle + Postgres
    002-fsm-module.md            [Proposed]            # DESIGN-002 — transitionJob/transitionRole helpers
    003-trpc-api-surface.md      [Proposed]            # DESIGN-003 — 5 routers
    004-auth-wiring.md           [Proposed]            # DESIGN-004 — Better Auth + Workspace OIDC
    005-notifications-adapter.md [Proposed]            # DESIGN-005 — Resend + React Email
    006-ui-components.md         [Proposed]            # DESIGN-006 — Next.js App Router layout
  plans/                                                # agentic coding plans
    000-template.md
    001-project-scaffolding.md                [Proposed]
    002-database-schema-implementation.md     [Proposed]
    003-fsm-module-implementation.md          [Proposed]
    004-auth-wiring-implementation.md         [Proposed]
    005-trpc-procedures-implementation.md     [Proposed]
    006-walking-skeleton-ui-implementation.md [Proposed]
    007-notifications-implementation.md       [Proposed]
    008-walking-skeleton-e2e-test.md          [Proposed]
    009-deploy-prototype.md                   [Proposed]
  releases/
    000-template.md
    001-mvp.md                                          # REL-001 MVP release manifest
```

## 5. Project conventions you must honor

- **Stable IDs, never renumber.** PRD-NN, ADR-NN, DDD-NN, BCC-NN, ADC-NN, DESIGN-NN, PLAN-NN at file level; R-NN, US-NN, AC-NN, Q-NN, ST-NN, INV-NN, CMD-NN, EVT-NN, T-NN, BR-NN, etc. inside files. Cross-doc references use `<DocID> <InnerID>` (e.g., `PRD-002 R-12`).
- **3-digit numbering.** `001-…`, not `0001-…`.
- **Status lifecycle:** Draft → Proposed → Accepted → Superseded by/Deprecated. Accepted is immutable; supersede via new doc.
- **MADR 3.0 for ADRs** — explicit decision drivers, considered options, decision outcome with C-NN consequences.
- **EARS for new R-NN** in revised-template PRDs — Ubiquitous / Event-driven / State-driven / Optional / Unwanted-behaviour.
- **Append-only changelogs** in §12 of most docs. Never edit prior entries.
- **Memory-first context.** The user's auto-memory is at `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md`. **You MUST read it** before starting — it captures durable user preferences and project facts you cannot derive from the docs alone.

## 6. Subagent review strategy (recommendation, not mandate)

Spawn **5 parallel subagents** each with a tightly-scoped review brief. Run them concurrently. Each returns a structured report with: **(a) gaps found**, **(b) continuity issues**, **(c) confidence level**, **(d) recommended remediation**.

| # | Subagent scope | What "gaps" looks like here | What "continuity" looks like here |
|---|----------------|------------------------------|------------------------------------|
| 1 | **PRD continuity audit** — `docs/prds/001…008` (skip 009) | Capability-level R-NN in PRD-001 not decomposed by any per-capability PRD; user stories without backing R-NN; resolved Q-NN with downstream contradictions | Cross-PRD references (PRD-002 R-NN cites PRD-001 R-NN); §7.2 "DO NOT CHANGE" tables agree across owning vs. citing PRDs; consistent terminology with the glossary (`docs/domain-driven-design/003-ubiquitous-language.md` T-NN entries) |
| 2 | **ADR continuity audit** — `docs/adrs/001…011` | Decisions in design docs not anchored to any ADR; ADRs proposing things later contradicted by another ADR; no-longer-relevant ADRs that should be Superseded | Designs cite the right ADRs in their `related.adrs` frontmatter; ADR consequences (C-NN) are honoured by downstream designs/plans |
| 3 | **DDD continuity audit** — `docs/domain-driven-design/*` | Walking-skeleton events (E-NN) not surfaced as commands (CMD-NN) in BCC-02; aggregate invariants (INV-NN) not enforced anywhere downstream; ubiquitous-language terms used in PRDs but missing from DDD-003 | The 3 BCCs in DDD-004 match what BCC-01/02 canvases say; the candidate-context reconciliation in DDD-004 §4 explains why DDD-001/002 §6 candidates were folded; the Mermaid diagrams in DDD-001 §3.1 + DDD-002 §3.3 match the §3 timeline tables event-for-event |
| 4 | **Designs continuity audit** — `docs/designs/001…006` | PRD R-NN with no design realising them; ADC invariants without an enforcing constraint somewhere; DESIGN cross-references (e.g., `DESIGN-002 §4.1.4` hooks called from `DESIGN-003 §4.4`) that don't actually appear where they're claimed | Per-design `related.prds` / `related.adrs` / `related.bounded_contexts` / `related.aggregates` are accurate; "out of scope owned by other designs" sections in §2.2 don't double-claim; settings keys + email templates + tRPC procedure names match across designs (e.g., `moderators_recipient_email` appears in DESIGN-005 + DESIGN-003 §4.6 + PRD-007 R-07 + PRD-002 R-12 — verify all four agree) |
| 5 | **Plans continuity audit** — `docs/plans/001…009` | Plans citing designs that don't exist; plans missing prerequisite plans in `related.plans`; plan `Verification` checklists not mapping to any PRD AC; plans referencing non-existent file paths | Plan ordering is sane (PLAN-001 scaffolding → PLAN-002 schema → PLAN-003 FSM → PLAN-004 auth → PLAN-005 tRPC → PLAN-006 UI → PLAN-007 notifications → PLAN-008 E2E → PLAN-009 deploy); Resume-points in each plan are coherent; "Out of scope" sections agree with what other plans claim to own |

You are free to add a 6th subagent or restructure if you spot a different cut. The goal is **broad coverage with parallel execution**, not exact-process compliance.

### Subagent prompt template

For each subagent, brief them with:

> You are reviewing the **<scope>** of the TODOs for Dues docs at `/Users/thaynes/src/projects/todos-for-dues/docs/<subpath>/`. Read every file in scope. Cross-reference against the broader docs as needed (PRD-001, the DDD ubiquitous language, the release manifest at `docs/releases/001-mvp.md`). Identify (a) **gaps** — things that should exist per the cited convention/contract but don't, and (b) **continuity issues** — places where two docs disagree, where references point to the wrong section, where IDs are duplicated or missing. Return a markdown report with sections for each finding: **What** (concise), **Where** (file path + line/section), **Why it matters** (impact on downstream agents), **Recommended fix** (1–3 sentences). Rank findings high → low. Do NOT modify any files. Reply in under 1500 words.

You can use the `Explore` agent type for these — they're read-only investigations that benefit from quick file-pattern searches.

## 7. Synthesise findings

After subagents return:

1. Deduplicate findings (multiple subagents may flag the same issue).
2. Rank: **must-fix-before-Agent-B-can-proceed**, **should-fix-soon**, **nice-to-have**.
3. For each must-fix, decide:
   - Can Agent B work around it by including the fix as a precondition step in their plan? → include in Prompt-2.
   - Is it severe enough that no plan can be produced without resolving it? → escalate to user, do not produce Prompt-2 yet.

## 8. Output: Prompt-2 at `.agents/prompts/002-plan-decomposition.md`

The output of this whole exercise is a **single new prompt file** that briefs a fresh agent (call them Agent B) on how to take the project's **designs** and produce **plans** suitable for implementation agents to execute.

**Note:** plans already exist at `docs/plans/PLAN-001..PLAN-009`. Agent B's job is **not** necessarily to start from scratch — it is to **ensure the plans are agent-executable, complete, and aligned with the designs after your review**. Agent B may:

- Refine the existing plans to address gaps you found.
- Add new plans for capabilities not yet covered (e.g., if you discover the MVP UI plan covers walking-skeleton only and the rest of MVP UI lacks a plan).
- Reorganise plans if you find the current breakdown doesn't match the designs.

You decide what Agent B should do, and your Prompt-2 instructs them. Make Prompt-2 self-contained — Agent B has no context either. Mirror this prompt's structure where useful (project at-a-glance, what-to-read-first, conventions, deliverable, output spec).

### Required structure for Prompt-2

At minimum, Prompt-2 must include:

1. **Project at a glance** (copy-adapt from §1 of this prompt; update "current state" to reflect post-review state).
2. **Findings from your review** — the must-fix and should-fix lists from your synthesis. Agent B starts here.
3. **Agent B's task** — phrase it precisely. Examples:
   - "Refine PLAN-005 §4 Step 2's procedure list to include the `users.changeRole` integration test missing from current coverage."
   - "Write a new PLAN-010 for full MVP UI (the Admin view + dispute UI + role-management UI + settings UI not covered by PLAN-006)."
   - "Reconcile PLAN-007 against DESIGN-005 §4.4 — the moderator email helper signature changed when PRD-002 R-12 was added; PLAN-007 still references the older shape."
4. **What to read first** — Agent B's reading list. Same shape as §3 of this prompt.
5. **Plan template + structure** — point Agent B at `docs/plans/000-template.md` and explain the per-plan shape (Goal, Inputs, Outputs, ordered Steps with Verification + Resume notes, Risks, Open questions).
6. **Definition of done for Agent B** — when does Agent B know they're finished? E.g.:
   - "Every PRD AC across PRDs 002–008 has at least one plan step that produces or verifies it."
   - "Every PRD-002..008 R-NN is implemented by at least one plan."
   - "Every DESIGN section has a corresponding plan step or is explicitly out-of-scope."
   - "All cross-doc references resolve."
7. **What Agent B does NOT do** — they don't write code; they don't change PRDs, ADRs, designs, or DDD artifacts; they don't run any commands beyond reading; they don't promote statuses.
8. **Output for Agent B** — file paths, commit message format, anything that comes after them (the implementation agents).
9. **Conventions to honour** (copy from §5).
10. **A concise findings appendix** if findings need more space than fits in §2 inline.

### Format guidance for Prompt-2

- Keep it 200–500 lines. Self-contained but not bloated.
- Use Markdown tables for findings + checklists for Agent B's deliverables.
- Cite specific files and §X.Y subsections — never paraphrase what's in another doc.
- Treat Agent B as a smart-but-uninformed colleague: they need everything load-bearing inline, but you don't need to explain the obvious.

## 9. What you do NOT do

- Modify any docs in `docs/`.
- Run any code or shell commands beyond reading files.
- Spawn implementation agents.
- Write code.
- Promote doc statuses.
- Create new memory files. (Reading existing memory is fine; writing is the user's job.)

## 10. Your deliverable

A single new file at `.agents/prompts/002-plan-decomposition.md` plus a short report-back to whoever invokes you summarising:

- How many findings each subagent surfaced.
- Top 3 most-impactful findings.
- A one-line description of what Prompt-2 is asking Agent B to do.
- Any blockers that prevented you from producing Prompt-2 (escalated to user).

## 11. Practical tips

- The Mermaid sequence diagrams in `docs/domain-driven-design/001-ddd-active-walking-skeleton.md` §3.1 and `002-ddd-alumni-walking-skeleton.md` §3.3 are the easiest fast-read of the full job loop. Open them first.
- The single most-load-bearing doc is `docs/domain-driven-design/aggregates/001-job-aggregate-canvas.md` (ADC-01 — the central aggregate with 17 state transitions + 15 invariants). Most continuity issues will trace back to it.
- The MVP release manifest at `docs/releases/001-mvp.md` is the authoritative scope statement — anything not listed there is out of MVP.
- Resolved questions in PRD-001 §9 (Q-01..Q-08) carry historical context; don't re-litigate them, but verify downstream docs honour their resolutions.
- The user prefers terse, direct responses (see `feedback_brief_responses.md` in their memory) — your final report-back should be ~200 words, not a wall of text.

## 12. If you get stuck

If the docs are internally contradictory in a way you can't resolve, OR if a critical gap means no useful Prompt-2 can be produced, **escalate back to the user** with: (1) what you found, (2) why it blocks, (3) what decision the user needs to make. Don't invent product or domain decisions.

---

**Begin.** Read the user's memory at `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md`, then `docs/PROCESS.md`, then proceed.
