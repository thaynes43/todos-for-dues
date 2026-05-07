# Agent Handoff — TODOs for Dues

This file captures everything a Claude Code session (or any agent) needs to be productive on this project. The previous session built the docs-first scaffolding; this is the condensed handoff so a fresh session can pick up without re-reading prior conversation history.

**Read this fully before making changes.** When you're done, save the working-style and convention items to your memory system so subsequent sessions don't have to re-read this file.

---

## What this project is

Per-organization SaaS for Greek-life chapters. **Alumni** post small jobs (each job is a "TODO") with a dues contribution amount and minimum tip percentage. **Moderators** (escalated Alumni) review and approve postings. **Actives** (current undergraduate members) claim approved jobs, do the work, contact the Alumni in-app. The Alumni pays the dues directly to the chapter (Venmo for the launch chapter — the app does **not** custody money or process payments) and marks the job paid; the Active confirms receipt to close the loop. **Admins** (chapter staff) escalate roles and manage the instance.

One SaaS instance per fraternal organization. App-managed accounts ship first; OIDC SSO is post-MVP.

The product name **"TODOs for Dues"** reads as: a TODO is a job an Alumni posts; *for Dues* means an Active completes TODOs to fund their chapter dues.

Full picture: `docs/prds/001-todos-for-dues-overview.md`.

---

## User

- **Tom Haynes** (`manofoz@gmail.com`)
- GitHub: `thaynes43`

---

## Where we are

- **PRD-001** (product overview) — Proposed.
- **ADR-001 through ADR-006** (web framework, auth, API contract, DB + ORM, email, hosting) — all Proposed.
- **No code yet.** Walking-skeleton design docs and implementation plan come after PRD-002.
- **Immediate next step:** draft `docs/prds/002-mvp.md` (turns the capability-level requirements in PRD-001 into testable feature requirements with acceptance criteria), then domain model, then walking-skeleton flow spec.

---

## How we work (SDLC)

Full process: `docs/PROCESS.md`. Highlights:

- **Docs-first agentic workflow:** PRD → ADR → DDD (domain model) → walking-skeleton flow → design docs → agent-generated implementation plan → build → test → iterate → deploy.
- **Walking skeleton first** — thinnest end-to-end slice that touches every layer (real auth, real DB, real deploy). Skeleton proves the architecture; everything after is fleshing out.
- **Strategic DDD at the seams** before code: bounded contexts, ubiquitous language, context map. Tactical DDD (aggregates, value objects) only where it earns its keep.
- **Bias to small, reversible decisions.** ADRs are cheap; rewrites aren't. When in doubt, write the ADR.
- **Agents are first-class participants.** Their inputs and outputs are the documents above.

---

## Doc conventions

- **3-digit numbering** for PRDs and ADRs (`001-...md`, not `0001-...md`). IDs match (`PRD-001`, `ADR-001`).
- **Templates colocated** as `000-template.md` in each doc-type directory:
  - `docs/prds/000-template.md`
  - `docs/adrs/000-template.md`
- **ADRs use MADR 3.0** (not Michael Nygard) — explicit decision drivers, considered options with pros/cons, and good/bad/neutral consequences with stable IDs (`C-01`, `C-02`, …) so other docs can cite them.
- **PRDs use stable IDs** — `R-NN` (requirements), `US-NN` (user stories), `AC-NN` (acceptance criteria), `Q-NN` (open questions). **Never renumber.** Modify wording in place.
- **Status lifecycle** (in frontmatter): `Draft` → `Proposed` → `Accepted` → (`Superseded by NNN` | `Deprecated`). Accepted docs are immutable; supersede with a new doc.
- **Per-doc changelog entries** (append-only) when content materially changes after first draft.

---

## Working style — user preferences

These are durable preferences. Honor them without being asked.

- **Ask, don't invent.** When drafting project docs (PRDs, ADRs, designs, flows, plans), if a detail is unknown — product decision, technical constraint, scoping call — pause and ask the user rather than fabricating a plausible answer. Reasonable defaults inside code are fine; in docs, prefer a question. Quote: *"Please ask me questions if you don't have enough context instead of making things up in these documents. I never mind answering a question."*
- **One question at a time** when iterating on contested decisions (the user said: *"Let's do questions one at a time"*). Bundling a few related ones is fine if they're tightly coupled; ping-pong is fine.
- **State a lean alongside questions.** The user can accept, redirect, or counter — but a question without a recommendation costs them more time.
- **Brief, direct responses.** Less narration, more substance. Match length to the task.

---

## Tech-stack picks (each fully justified in `docs/adrs/`)

- **ADR-001** — Next.js (App Router) + TypeScript + React + Tailwind + shadcn/ui. Mobile-future via React Native (Expo) when warranted.
- **ADR-002** — Better Auth + custom invite-token gate. Email + password with optional MFA (TOTP) and passkey (WebAuthn). MFA *required* for Moderator and Admin. OIDC SSO post-MVP. Bootstrap admin via `BOOTSTRAP_ADMIN_EMAIL` env var on a fresh DB.
- **ADR-003** — tRPC for the portable domain API. Server Actions reserved for at-most-three web-only form ergonomics (signup, login, password reset). Webhooks/OAuth callbacks use Next.js Route Handlers. Mobile contract is bearer-token transport over the same procedures.
- **ADR-004** — Postgres + Drizzle ORM. `drizzle-kit` produces SQL migrations checked into git. `drizzle-zod` derives Zod schemas reused by tRPC.
- **ADR-005** — Resend + React Email for transactional. Templates in `packages/emails/`. Webhook-driven suppression for bounces/complaints.
- **ADR-006** — Self-hosted K8s via the haynes-ops Flux pipeline. GHCR images. GitHub Actions CI. Phase 1.1 internal (`*.haynesops.com` via `traefik-internal`) → Phase 1.2 external (`*.haynesnetwork.com` via `traefik-external` + cloudflare-tunnel) → Phase 2 GKE migration (separate ADR when triggered).

### Test-DB rule (normative)

Tests use **the same Postgres engine as prod** — Testcontainers spin up PG16 in CI and locally. **No SQLite or MySQL substitution.** ADR-004 commits to Postgres-specific features (`citext`, `pgcrypto`, `gen_random_uuid()`); engine substitution masks real bugs.

---

## External pointers

- **GitHub repo:** <https://github.com/thaynes43/todos-for-dues>. Currently working off `main`; PR-based workflow comes later.
- **GitOps repo:** `/Users/thaynes/src/labspace/haynes-ops` (Flux-managed, user's self-hosted cluster). App manifests will live at `kubernetes/main/apps/frontend/todos-for-dues/`. Mirror the pattern of existing apps (e.g., `frontend/homepage/`).
- **Cluster components already running in `haynes-ops`** (don't add duplicates):
  - **Postgres:** CloudNative-PG with shared `cluster16` PG16 cluster. Plan: dedicated database within `cluster16` for the SaaS (per-chapter when multi-tenant).
  - **Ingress:** Traefik v3 with two classes:
    - `traefik-internal` → LAN-only on `*.haynesops.com`, cert `certificate-haynesops`. Phase 1.1 (dev/test/private alpha).
    - `traefik-external` → public on `*.haynesnetwork.com`, cert `certificate-haynesnetwork`, via existing `cloudflare-tunnel`. Phase 1.2 (go-live).
  - **Secrets:** External Secrets Operator + 1Password Connect (user's personal 1Password vault).
  - **DNS:** `external-dns` via annotations on the IngressRoute.
  - **SOPS+age** for Flux-level secret decryption.

---

## Open questions still on the table

See PRD-001 §9 (Q-01 through Q-08) for the full list. Highest-impact for MVP scope:

- **Q-01** — Tenancy at chapter or national-org level (affects branding, billing, moderation scope).
- **Q-04** — Dispute path when payment is marked sent but not received.
- **Q-05** — Multi-Active on one job (team task with split dues).
- **Q-06** — Tip handling (paid to Active personally, or also flows to chapter dues).
- **Q-08** — Admin self-protection on role demotion (preventing the last Admin from being removed).

These should be resolved before or during PRD-002 drafting.

---

## Background: why this handoff exists

A previous session was started at `/Users/thaynes/src/projects/todo-for-dues` (the singular path). The repo was renamed on GitHub from `todo-for-dues` to `todos-for-dues`, and the user planned to rename the local working directory accordingly. Claude Code derives the per-project memory path from the working directory, so renaming the project dir means a fresh session won't see the prior memories. **This file is the deliberate alternative to migrating the memory directory** — read it cold, save what's useful to your own memory, and proceed.

---

## Suggested first action for a fresh agent

1. Read this file fully (you're doing it).
2. Read `docs/PROCESS.md` for the SDLC.
3. Read `docs/prds/001-todos-for-dues-overview.md` (the overview PRD).
4. Skim `docs/adrs/001-web-framework.md` through `006-hosting.md`.
5. Save the **Working style** and **Doc conventions** sections above to your memory system as feedback-type entries, and the project shape as a project-type entry, so future sessions don't need to re-read this file.
6. Ask the user what to do next. Last task discussed in the prior session was drafting `docs/prds/002-mvp.md`.
