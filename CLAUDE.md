# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

**TODOs for Dues** — per-organization SaaS for Greek-life chapters. Alumni post small jobs ("TODOs") with a dues contribution; Actives claim and complete them; Moderators approve postings; Admins manage the instance. The app does **not** custody money — payment happens out-of-band (Venmo for the launch chapter). Full product framing lives in `docs/prds/001-todos-for-dues-overview.md`; MVP scope in `docs/releases/001-mvp.md`.

The agent prompts under `.agents/prompts/` and the per-plan `docs/plans/NNN-*-validation.md` files describe how PLAN-NNN work is kicked off and verified.

## Docs-first SDLC

This repo follows a strict docs-first pipeline (full description in `docs/PROCESS.md`):

```
PRD → ADR → DDD → flow spec → design doc → implementation plan → code → unit test → validation plan → e2e
```

Pipeline state map: `docs/plans/COVERAGE.md` is the authoritative matrix from every PRD R-NN/AC-NN and DESIGN §4 subsection to its PLAN-NNN + VALIDATION-NNN. Always check it before adding new work.

Doc conventions (enforced):
- 3-digit numbering (`PRD-001`, `ADR-001`, `PLAN-001`); start new docs from the `000-template.md` in each folder.
- ADRs use **MADR 3.0** with stable consequence IDs (`C-01`, …) and are immutable once `Accepted` — supersede with a new ADR rather than editing.
- PRDs use stable `R-NN` / `US-NN` / `AC-NN` / `Q-NN` IDs — **never renumber**; modify wording in place.
- Status lifecycle in frontmatter: `Draft` → `Proposed` → `Accepted` → (`Superseded by NNN` | `Deprecated`).
- DDD IDs (per `docs/domain-driven-design/README.md`): `DDD-NN`, `BCC-NN`, `ADC-NN`, `T-NN`, `E-NN`, `INV-NN`, `CMD-NN`, `EVT-NN`, `ST-NN`.

When drafting docs, **ask rather than invent** for unknowns; reasonable defaults are fine in code, not in docs. State a lean alongside questions; iterate one question (or tightly-coupled bundle) per turn.

## Workspace layout

pnpm workspace (`pnpm-workspace.yaml`): `apps/*` and `packages/*`.

| Path | Purpose |
|---|---|
| `apps/web` | Next.js 16 (App Router) + Tailwind v4 + shadcn/ui. Hosts Better Auth handler at `/api/auth/[...all]` and tRPC fetch adapter at `/api/trpc/[trpc]`. |
| `packages/db` | Drizzle ORM schema, migrations (`migrations/*.sql`), `runMigrations()` helper, and `db` Proxy that lazy-initializes the pg `Pool` from `DATABASE_URL`. |
| `packages/domain` | FSM helpers (`transitionJob`, `transitionRole`) + `JOB_TRANSITIONS` map. **All job-state and role-state writes must route through here** — see "Domain invariant" below. |
| `packages/auth` | Better Auth config, OIDC plugin, HD-restriction hook, bootstrap-admin-on-signin hook, invite-token verification. |
| `packages/api` | tRPC `appRouter` + context. Routers live under `src/routers/`. |
| `packages/notifications` | Outbound email adapter (Resend per ADR-005). |
| `packages/test-utils` | Testcontainers helper — `startPostgres()` boots PG16. |

Internal packages export TypeScript directly via `src/*.ts` (`main`/`types`/`exports` all point at sources); no compiled `dist` is consumed within the workspace.

## Common commands

```sh
# From repo root:
pnpm install
pnpm dev                  # = pnpm --filter web dev → http://localhost:3000
pnpm typecheck            # tsc --noEmit, all packages (recursive)
pnpm lint                 # eslint, all packages (recursive)
pnpm test                 # vitest run, all packages with a `test` script
pnpm format               # prettier --write across the repo
pnpm --filter web build   # production build of the web app

# Database (needs DATABASE_URL):
pnpm --filter @app/db generate   # drizzle-kit generate (regenerate SQL from schema)
pnpm --filter @app/db migrate    # runs tsx src/scripts/migrate.ts

# Single-package or single-test:
pnpm --filter @app/domain test
pnpm --filter @app/db test -- --run __tests__/min-admin-invariant.test.ts
pnpm --filter web e2e            # Playwright; auto-starts `pnpm dev` via webServer config
```

A local Postgres 16 must be reachable at `DATABASE_URL` for migrate, dev, and any test that hits the DB — use the docker one-liner in `apps/web/README.md` if you don't have one running.

## Test-DB rule (NORMATIVE)

Tests use the **same Postgres engine as prod** — Testcontainers spins up `postgres:16` in CI and locally (`packages/test-utils/src/postgres.ts`). **No SQLite or MySQL substitution, ever.** ADR-004 relies on `citext`, `pgcrypto`, `gen_random_uuid()`, partial indexes, and triggers — engine substitution would mask real bugs (this is why `pnpm test` requires Docker).

## Pull-request flow (NORMATIVE)

From PLAN-009 Step 2.5 onward, `main` is **branch-protected**. Direct push to `main` is rejected by GitHub. Every code change — from the coordinator and from execution / validation agents alike — follows this flow:

1. Create a branch (`plan-NNN-execution`, `plan-NNN-validation`, `fix-…`, `chore-…`, etc.).
2. Push the branch and open a PR against `main`.
3. Wait for required status checks (`lint-and-typecheck`, `test`) to go green.
4. Squash-merge (linear history is required; no merge commits).

Hot-fixes that bypass CI are a coordinator-only break-glass — agents must never `gh pr merge --admin` or push to `main` directly.

## Release versioning (release-please)

Docker images are released by tag, not by commit:

- Day-to-day commits use **conventional-commit prefixes** (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`). The CI workflows ignore the prefix, but release-please reads it to compute version bumps.
- When changes land on `main`, the **release-please** GitHub Action opens (or updates) a release PR titled `chore(main): release vX.Y.Z` with a generated CHANGELOG and a bumped `version` field in the root `package.json`.
- Merging the release PR creates a `vX.Y.Z` git tag. The CI `build-image` job triggers on that tag and pushes `ghcr.io/thaynes43/todos-for-dues:vX.Y.Z` and `:latest`.
- **Bump rules** (SemVer, derived from conventional commits):
  - `feat:` → minor bump (`v1.2.0` → `v1.3.0`)
  - `fix:` → patch bump (`v1.2.0` → `v1.2.1`)
  - `feat!:` or a `BREAKING CHANGE:` footer → major bump (`v1.2.0` → `v2.0.0`)
  - `chore:`, `docs:`, `refactor:`, `test:` → no bump (changelog-only)
- The `:latest` Docker tag always points at the most recent SemVer release. The init container in PLAN-009 Step 5 pins a specific version, not `:latest`, so production deploys are reproducible.

## Domain invariant — FSM-only state writes

Job state and user role state are **never** written by direct UPDATE. All transitions go through `transitionJob` / `transitionRole` in `packages/domain`, which atomically write the state row + the matching audit-log row (`job_state_transitions`, `user_role_transitions`) inside a single transaction. There is a dedicated test (`packages/domain/__tests__/no-direct-state-writes.test.ts`) that scans for direct writes and fails CI if any are added.

`packages/domain/src/job-state-machine.ts` is the single source of truth for the FSM (`JOB_TRANSITIONS` map). Adding a transition = update the map + add a test.

Role demotions are gated by a DB trigger that enforces "min 1 Admin per chapter" (PRD-001 Q-08, migration `0003_min_admin_trigger.sql`). The `transitionRole` helper maps the trigger error to a typed domain error.

## Auth wiring

- Two account paths: (a) Google Workspace OIDC SSO via Better Auth's `genericOAuth` plugin (HD-restricted at the OAuth callback in `mapProfileToUser` — non-HD aborts before any user row is created); (b) email+password gated by an invite-token. SSO users do not need an invite token; same email = same account (Better Auth account linking with the OIDC provider as a trusted provider).
- OIDC is enabled iff all three of `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_HOSTED_DOMAIN` are set; otherwise the SSO button is hidden.
- `BOOTSTRAP_ADMIN_EMAIL` is checked on every session-create via the `bootstrapAdminOnSignin` databaseHook (idempotent; routes through `transitionRole`, so the audit trail is honored).
- All Better Auth tables (`users`, `session`, `account`, `verification`) are owned by `packages/db/src/schema/` — Better Auth uses the Drizzle adapter with `modelName: 'users'` and the `name` column mapped to `displayName`. The Better Auth-managed credential plugin owns passwords; the legacy `users.password_hash` column was dropped in migration `0006`.

## Packaging notes

- TypeScript is `strict` + `noUncheckedIndexedAccess` + `noImplicitOverride` (see `tsconfig.base.json`). Module resolution is `NodeNext`; all packages are ESM (`"type": "module"`).
- `apps/web` is **Next.js 16**. Its in-repo `AGENTS.md` warns: *"This is NOT the Next.js you know"* — read `node_modules/next/dist/docs/` before writing App Router / Server Action / handler code rather than relying on training-data conventions. Tailwind is v4 (PostCSS plugin only — no `tailwind.config.*`).
- `pnpm-workspace.yaml` allowlists native builds (`esbuild`, `sharp`, `ssh2`, `cpu-features`, `protobufjs`, `msw`, `unrs-resolver`); any new package needing a build script must be added there.
