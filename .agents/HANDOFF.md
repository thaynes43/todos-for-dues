# Agent Handoff — TODOs for Dues

**Last updated:** 2026-05-14  
**Read this fully before making changes.** Save the working-style and doc-convention sections to your memory system so future sessions don't re-read this file.

---

## What this project is

Per-organization SaaS for Greek-life chapters. **Alumni** post small jobs ("TODOs") with a dues contribution amount and minimum tip percentage. **Moderators** (escalated Alumni) review and approve postings. **Actives** (current undergrads) claim approved jobs, do the work, and contact Alumni in-app. The Alumni pays dues directly to the chapter (Venmo for the launch chapter — the app **does not** custody money or process payments) and marks the job paid; the Active confirms receipt to close the loop. **Admins** (chapter staff) escalate roles and manage the instance.

One SaaS instance per fraternal organization. The product name reads as: a *TODO* is a job an Alumni posts; *for Dues* means an Active completes TODOs to fund chapter dues.

Full picture: `docs/prds/001-todos-for-dues-overview.md`.

---

## User

- **Tom Haynes** (`manofoz@gmail.com`)
- GitHub: `thaynes43`

---

## Current state of docs

| Doc | File | Status | Notes |
|-----|------|--------|-------|
| PRD-001 | `docs/prds/001-todos-for-dues-overview.md` | Draft | Product overview. R-10 / US-10 updated: OIDC SSO is P0/MVP (not post-MVP). |
| PRD-003 | `docs/prds/003-identity-and-access.md` | Draft | Identity & Access. Two account paths: Workspace OIDC SSO + app-managed invite-token. 9 requirements, 7 ACs. 3 open questions remain (Q-02, Q-03, Q-04). |
| ADR-001 | `docs/adrs/001-web-framework.md` | Proposed | Next.js (App Router) + TypeScript + Tailwind + shadcn/ui |
| ADR-002 | `docs/adrs/002-auth.md` | Proposed | Better Auth + invite-token gate. Updated: OIDC SSO in MVP, 3 new integration tests, ADR-007 linked. |
| ADR-003 | `docs/adrs/003-api-contract.md` | Proposed | tRPC domain API; Server Actions for ≤3 web forms; Route Handlers for webhooks |
| ADR-004 | `docs/adrs/004-db-and-orm.md` | Proposed | Postgres + Drizzle ORM. drizzle-zod → Zod schemas reused by tRPC. |
| ADR-005 | `docs/adrs/005-email.md` | Proposed | Resend + React Email. Templates in `packages/emails/`. |
| ADR-006 | `docs/adrs/006-hosting.md` | Proposed | Self-hosted K8s via haynes-ops Flux pipeline. GHCR + GitHub Actions CI. |
| ADR-007 | `docs/adrs/007-google-workspace-oidc.md` | Draft | Better Auth OIDC client plugin, HD-restricted at callback, per-instance env-var config, MFA delegated to Workspace admin. |

**PRD-002 does not exist yet.** It is the immediate next deliverable.

**No code exists yet.**

---

## Immediate next step

Draft `docs/prds/002-mvp.md` — turns PRD-001's capability-level requirements into testable feature requirements with acceptance criteria for the MVP release. Before or during drafting, resolve the open questions below (highest-impact ones first).

After PRD-002: domain model (`docs/domain/`) → walking-skeleton flow spec (`docs/flows/`) → design docs → implementation plan → build.

---

## Open questions blocking PRD-002

From PRD-001 §9 (Q-01 through Q-08). Highest-impact for MVP scope — resolve these one at a time:

| ID | Question | Lean |
|----|----------|------|
| Q-01 | Tenancy at chapter or national-org level? Affects branding, billing, moderation scope. | Chapter-level for MVP |
| Q-04 | Dispute path when Alumni marks payment sent but Active never receives funds? | Surface to Admin out-of-band; no in-app dispute flow for MVP |
| Q-05 | Multi-Active on one job (team task, split dues)? Defer or include in MVP? | Defer |
| Q-06 | Tip handling: paid to Active personally, or also flows to chapter dues? | Active personally (simplest) |
| Q-08 | Prevent last Admin from demoting all Admins? Options: DB invariant, N≥2-Admin confirmation, or bootstrap env var as recovery. | DB invariant (min 1 Admin) |
| Q-03 | How are Alumni initially seeded into a new instance? Admin imports roster, self-claim via verified email, or invite-link only? | Invite-link only for MVP |

---

## Identity & Access — key decisions already made

These are settled and in the docs. Do not re-litigate without a new ADR:

- **Two account paths:** (a) Google Workspace OIDC SSO for `@{OIDC_HOSTED_DOMAIN}` users; (b) app-managed email+password via invite-token-gated signup.
- **Invite token not required for SSO users.** Workspace membership = sufficient authorization. Auto-creates Alumni account on first SSO login.
- **Invite token required for all app-managed accounts** (Actives + non-Workspace Alumni).
- **Account linking:** same email = same account. SSO credential auto-links to an existing app-managed account on first SSO sign-in. No duplicate accounts. (PRD-003 R-09)
- **HD restriction** enforced at the OAuth callback server-side. Non-HD users are rejected before any session is created.
- **MFA for SSO-using Moderators/Admins** is delegated to the Workspace admin (not enforced app-side). App-managed Moderators/Admins must enroll app TOTP/passkey.
- **Per-instance config:** `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_HOSTED_DOMAIN` env vars. Absent = SSO button hidden, app-managed only.

Open questions in PRD-003 (lower priority, can defer to design doc):
- Q-02: What happens when a user leaves the Workspace? (Lean: manual Admin deactivation for MVP)
- Q-03: Should the app verify Workspace enforces MFA for privileged SSO users? (Lean: no — documented in setup checklist)
- Q-04: Should the generic OIDC mechanism support any OIDC provider, or only Google Workspace? (Lean: generic, rename env vars accordingly)

---

## How we work (SDLC)

Full process: `docs/PROCESS.md`. Highlights:

- **Docs-first agentic workflow:** PRD → ADR → domain model → walking-skeleton flow → design docs → implementation plan → build → test → iterate → deploy.
- **Walking skeleton first** — thinnest end-to-end slice touching every layer (real auth, real DB, real deploy). Proves the architecture; everything after is fleshing it out.
- **Strategic DDD at the seams** before code: bounded contexts, ubiquitous language, context map. Tactical DDD (aggregates, value objects) only where it earns its keep.
- **Bias to small, reversible decisions.** ADRs are cheap; rewrites aren't.
- **Agents are first-class participants.** A doc is "agent-ready" when another Claude instance can read it cold and produce useful output without guessing.

---

## Doc conventions

Honor these without being asked:

- **3-digit numbering:** `001-...md`, not `0001-...md`. IDs match: `PRD-001`, `ADR-001`.
- **Templates colocated:** `docs/prds/000-template.md`, `docs/adrs/000-template.md`. Start new docs from templates.
- **ADRs use MADR 3.0** — explicit decision drivers, considered options with pros/cons, good/bad/neutral consequences with stable IDs (`C-01`, `C-02`, …). Not Michael Nygard format.
- **PRDs use stable IDs** — `R-NN` (requirements), `US-NN` (user stories), `AC-NN` (acceptance criteria), `Q-NN` (open questions). **Never renumber.** Modify wording in place.
- **Status lifecycle** in frontmatter: `Draft` → `Proposed` → `Accepted` → (`Superseded by NNN` | `Deprecated`). Accepted docs are immutable — supersede with a new doc.
- **Per-doc changelog entries** (append-only) for material changes after first draft.

---

## Working style — user preferences

Durable. Honor without being asked:

- **Ask, don't invent.** When drafting docs, if a detail is unknown — product decision, technical constraint, scoping call — pause and ask rather than fabricating. Reasonable defaults in code are fine; in docs, prefer a question. Direct quote: *"Please ask me questions if you don't have enough context instead of making things up in these documents. I never mind answering a question."*
- **One question at a time.** Bundling 2–3 tightly-coupled questions in one turn is fine; long enumerated lists are not. Direct quote: *"Let's do questions one at a time."*
- **State a lean alongside questions.** A question without a recommendation costs the user more time.
- **Brief, direct responses.** Less narration, more substance. Match length to the task.

---

## Tech-stack picks (each justified in `docs/adrs/`)

- **ADR-001** — Next.js (App Router) + TypeScript + React + Tailwind + shadcn/ui. Mobile-future via React Native (Expo).
- **ADR-002** — Better Auth + custom invite-token gate. Email+password, optional TOTP MFA + passkeys (WebAuthn). MFA required for Moderator/Admin (app-managed). OIDC SSO via Google Workspace **in MVP** (not post-MVP). Bootstrap Admin via `BOOTSTRAP_ADMIN_EMAIL` env var.
- **ADR-003** — tRPC for the portable domain API. Server Actions for ≤3 web-only forms (signup, login, password reset). Route Handlers for webhooks/OAuth callbacks. Mobile: bearer-token over the same procedures.
- **ADR-004** — Postgres + Drizzle ORM. `drizzle-kit` SQL migrations in git. `drizzle-zod` derives Zod schemas reused by tRPC.
- **ADR-005** — Resend + React Email. Templates in `packages/emails/`. Webhook suppression for bounces/complaints.
- **ADR-006** — Self-hosted K8s via haynes-ops Flux pipeline. GHCR images. GitHub Actions CI. Phase 1.1 `*.haynesops.com` (internal) → Phase 1.2 `*.haynesnetwork.com` (external via cloudflare-tunnel) → Phase 2 GKE (separate ADR).
- **ADR-007** — Better Auth OIDC client plugin + HD restriction at callback for Google Workspace SSO. Per-instance env vars. No new IdP service.

### Test-DB rule (normative)

Tests use **the same Postgres engine as prod.** Testcontainers spin up PG16 in CI and locally. **No SQLite or MySQL substitution.** ADR-004 uses `citext`, `pgcrypto`, `gen_random_uuid()` — engine substitution masks real bugs.

---

## External pointers

- **GitHub repo:** https://github.com/thaynes43/todos-for-dues — working off `main`; PR-based workflow comes later.
- **GitOps repo:** `/Users/thaynes/src/labspace/haynes-ops` — Flux-managed self-hosted cluster. App manifests at `kubernetes/main/apps/frontend/todos-for-dues/`. Mirror `frontend/homepage/` pattern.
- **Google Workspace IdP reference:** `/Users/thaynes/src/projects/sigo-alumni/apps/Outline` — Outline wiki uses the same `@sigoalumni.org` Workspace via Google OAuth (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`). Pattern is proven for this org.

**Cluster components already running in haynes-ops** (don't add duplicates):
- **Postgres:** CloudNative-PG, shared `cluster16` PG16. Plan: dedicated DB within `cluster16`.
- **Ingress:** Traefik v3 — `traefik-internal` (LAN, `*.haynesops.com`) and `traefik-external` (public, `*.haynesnetwork.com` via cloudflare-tunnel).
- **Secrets:** External Secrets Operator + 1Password Connect.
- **DNS:** `external-dns` via IngressRoute annotations.
- **GitOps encryption:** SOPS+age.

---

## Suggested first action for a fresh agent

1. Read this file fully (you're doing it).
2. Skim `docs/prds/001-todos-for-dues-overview.md` and `docs/prds/003-identity-and-access.md`.
3. Skim `docs/adrs/002-auth.md` and `docs/adrs/007-google-workspace-oidc.md` — most recently updated.
4. Save **Working style**, **Doc conventions**, and the **Identity & Access key decisions** to your memory system.
5. Ask the user what to do next. Current focus: drafting `docs/prds/002-mvp.md`, which requires resolving the open questions in the table above (start with Q-01 — tenancy level).
