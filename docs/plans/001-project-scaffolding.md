---
id: PLAN-001
title: Project scaffolding — Next.js + workspaces + Drizzle + Better Auth (no business logic)
status: Draft
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
estimate: M
related:
  prds: [PRD-001]
  adrs: [ADR-001, ADR-002, ADR-003, ADR-004, ADR-005, ADR-006]
  bounded_contexts: []
  aggregates: []
  designs: [DESIGN-001, DESIGN-002, DESIGN-003, DESIGN-004, DESIGN-005, DESIGN-006]
  plans: []
  parent_plan: null
  supersedes: null
---

## 1. Goal

Set up the empty repository as an executable scaffold for the MVP: Next.js App Router app under `apps/web/`, package workspaces for shared `packages/db`, `packages/api`, `packages/auth`, `packages/domain`, `packages/notifications`. Configure tooling (TypeScript, ESLint, Prettier, Vitest, Playwright). Wire Drizzle (no schema yet — comes in PLAN-002), Better Auth (no plugins yet — full wiring in PLAN-004), and tRPC (empty router — full wiring in PLAN-005). **No business logic.** This plan produces a runnable but inert app.

> **Produces:** a `pnpm dev` that boots Next.js on `localhost:3000` with a placeholder home page, a `pnpm test` that runs Vitest with zero failing tests, a `pnpm typecheck` that passes, and a Drizzle-ready connection to a local Postgres (testcontainers in tests; `DATABASE_URL` in dev).
> **Definition of success:** `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm dev` (in separate terminals as needed) all succeed against a freshly-cloned repo + locally running Postgres 16.

## 2. Inputs

### 2.1 Documents the agent must read first

1. `docs/adrs/001-web-framework.md` — Next.js + TypeScript + Tailwind + shadcn/ui choices.
2. `docs/adrs/003-api-contract.md` — tRPC choice + Server Actions cap.
3. `docs/adrs/004-db-and-orm.md` — Postgres + Drizzle + testcontainers test-DB rule.
4. `docs/adrs/002-auth.md` — Better Auth choice (config in PLAN-004).
5. `docs/designs/000-template.md` — to understand the design-doc style this plan implements.
6. `docs/designs/001-database-schema.md` §3 (folder layout) — packages/db structure planned.
7. `docs/designs/006-ui-components.md` §3 (folder layout) — apps/web structure planned.
8. **Project test-DB rule** in `feedback_doc_conventions.md` (user memory) and the project `feedback_skip_confirm_when_strong.md` — for the agent's working style.

### 2.2 Repo state assumed

- Fresh clone of `github.com/thaynes43/todos-for-dues`.
- `docs/` populated (PRDs, ADRs, designs, DDD, releases). No source code yet.
- `.gitignore`, `LICENSE`, `README.md` may or may not exist; create or update as needed.

### 2.3 External dependencies

- Node.js ≥ 20 (LTS).
- pnpm ≥ 9 (`corepack enable && corepack prepare pnpm@latest --activate`).
- Postgres 16 reachable for local dev (e.g., via Docker `docker run -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16` — document in `apps/web/README.md`).
- Docker (for testcontainers in tests).

## 3. Outputs

After this plan completes, the repo contains:

- `pnpm-workspace.yaml` declaring workspaces under `packages/*` and `apps/*`.
- `package.json` (root) with dev-deps: TypeScript, ESLint, Prettier, Vitest, Playwright, tsx; scripts for `dev`, `build`, `test`, `typecheck`, `lint`, `format`.
- `tsconfig.base.json` shared TS config.
- `apps/web/` — Next.js App Router skeleton:
  - `package.json`, `next.config.mjs`, `tsconfig.json`
  - `app/layout.tsx` + `app/page.tsx` (placeholder home page)
  - `tailwind.config.ts` + `app/globals.css` + Tailwind initialised
  - shadcn/ui scaffolding: `components/ui/` empty + `components.json` config
  - Better Auth handler stub at `app/api/auth/[...all]/route.ts` (empty handler — wired in PLAN-004)
  - tRPC handler stub at `app/api/trpc/[trpc]/route.ts` (empty router — wired in PLAN-005)
- `packages/db/` — Drizzle setup:
  - `package.json`, `tsconfig.json`
  - `src/index.ts` exporting `db` (Drizzle client connected via `DATABASE_URL`)
  - `src/schema/` — empty barrel export (schema lands in PLAN-002)
  - `drizzle.config.ts` configured for Postgres + the schema folder
- `packages/api/` — tRPC setup:
  - `src/trpc.ts` — `initTRPC.context<...>().create()` + `createTRPCContext` per DESIGN-003 §4.1 (empty session for now)
  - `src/routers/index.ts` — empty `appRouter`
- `packages/auth/` — Better Auth setup:
  - `src/index.ts` — basic Better Auth instance with `emailAndPassword: { enabled: true }` (no OIDC plugin yet — added in PLAN-004)
- `packages/domain/` — empty for now; `src/index.ts` placeholder
- `packages/notifications/` — empty for now; `src/index.ts` placeholder
- `.env.example` listing required env vars: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY` (optional in dev), `OIDC_CLIENT_ID/SECRET/HOSTED_DOMAIN` (optional in dev), `BOOTSTRAP_ADMIN_EMAIL` (optional)
- `apps/web/README.md` — quickstart instructions
- One git commit: `chore: scaffold Next.js + pnpm workspaces + Drizzle + Better Auth + tRPC (no business logic)`

## 4. Steps

### Step 1 — Initialise pnpm workspace

- **Action:**
  - Run `pnpm init` at the repo root.
  - Create `pnpm-workspace.yaml`:

    ```yaml
    packages:
      - "apps/*"
      - "packages/*"
    ```

  - Edit root `package.json`: set `name: 'todos-for-dues'`, `private: true`, add scripts `dev`, `build`, `typecheck`, `lint`, `format`, `test` (each delegating to workspace tasks via `pnpm -r run <script>` or focused on `apps/web` for `dev`).
- **Verification:** `pnpm install` completes with no errors; `pnpm -r ls` shows the two empty workspaces.
- **Resume note:** after this step, the repo has a workspace skeleton but no apps/packages yet.

### Step 2 — Add shared TS / ESLint / Prettier config

- **Action:**
  - `tsconfig.base.json` at root with `target: ES2022`, `strict: true`, `module: NodeNext`, `paths: { "@app/*": ["packages/*/src", "apps/web/*"] }`.
  - Root `.eslintrc.cjs` with `next/core-web-vitals` (will be picked up once `apps/web` exists), `@typescript-eslint/recommended-strict`, `eslint-config-prettier`.
  - Root `.prettierrc` (defaults are fine; explicit for stability).
  - Add dev-deps: `typescript`, `@types/node`, `eslint`, `prettier`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `eslint-config-prettier`, `vitest`, `@vitest/coverage-v8`, `tsx`, `@playwright/test`.
- **Verification:** `pnpm typecheck` runs (no files to check yet — should report success); `pnpm lint` runs (likewise).
- **Resume note:** root tooling configured.

### Step 3 — Create `apps/web` (Next.js App Router)

- **Action:**
  - From the repo root, run `pnpm create next-app@latest apps/web` with flags: `--typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*"`.
  - Replace generated `app/page.tsx` with a placeholder:

    ```tsx
    export default function HomePage() {
      return <main>TODOs for Dues — placeholder home page</main>;
    }
    ```

  - Replace generated `app/layout.tsx` with a minimal layout (no nav yet).
  - Add the empty handler stubs at `app/api/auth/[...all]/route.ts` and `app/api/trpc/[trpc]/route.ts` — each just returns `new Response('not yet wired', { status: 501 })`.
  - Configure `apps/web/tsconfig.json` to extend `../../tsconfig.base.json`.
- **Verification:** `pnpm --filter web dev` starts Next.js on `localhost:3000` and shows the placeholder; `pnpm --filter web typecheck` passes.
- **Resume note:** Next.js app exists but is functionally empty.

### Step 4 — Initialise shadcn/ui

- **Action:**
  - In `apps/web/`, run `pnpm dlx shadcn@latest init` with defaults (TypeScript, Tailwind, components in `components/ui/`).
  - Verify `components.json` is committed.
  - Add `Button` component as a smoke-test: `pnpm dlx shadcn@latest add button`.
- **Verification:** `apps/web/components/ui/button.tsx` exists; importable from a placeholder usage in `app/page.tsx` (compiles).
- **Resume note:** shadcn scaffolding ready.

### Step 5 — Create `packages/db` (Drizzle setup)

- **Action:**
  - Create `packages/db/package.json` with name `@app/db`, `type: module`, deps: `drizzle-orm`, `pg`; dev-deps: `drizzle-kit`, `@types/pg`.
  - `packages/db/src/index.ts`:

    ```ts
    import { drizzle } from 'drizzle-orm/node-postgres';
    import { Pool } from 'pg';

    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required');
    }

    export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    export const db = drizzle(pool);
    ```

  - `packages/db/src/schema/index.ts`: empty barrel (to be filled in PLAN-002).
  - `packages/db/drizzle.config.ts`:

    ```ts
    import { defineConfig } from 'drizzle-kit';
    export default defineConfig({
      dialect: 'postgresql',
      schema: './src/schema/index.ts',
      out: './migrations',
      dbCredentials: { url: process.env.DATABASE_URL ?? '' },
    });
    ```

  - `packages/db/tsconfig.json` extends `../../tsconfig.base.json`.
- **Verification:** `pnpm --filter @app/db typecheck` passes; `pnpm --filter @app/db drizzle-kit generate` runs without error (will produce no migrations yet).
- **Resume note:** Drizzle ready to receive schema.

### Step 6 — Create `packages/api`, `packages/auth`, `packages/domain`, `packages/notifications`

- **Action:** for each package, create `package.json` (name `@app/<name>`, `type: module`), `tsconfig.json` extending base, `src/index.ts` with placeholder export. For `packages/api`:
  - `src/trpc.ts` per DESIGN-003 §4.1 (createTRPCContext + initTRPC.create + procedure factories — no auth yet, just the shape).
  - `src/routers/index.ts` exporting an empty `appRouter`.
  - Install deps: `@trpc/server`, `zod`.
- For `packages/auth`:
  - `src/index.ts` — basic Better Auth instance per ADR-002 with `emailAndPassword.enabled = true` and `drizzleAdapter(db)`. **No plugins yet.** Export `auth` and `getServerSession`.
  - Install deps: `better-auth`.
- **Verification:** `pnpm typecheck` (root) passes for all packages.
- **Resume note:** all packages exist with skeleton exports.

### Step 7 — Wire `apps/web` to consume the packages

- **Action:**
  - Add deps in `apps/web/package.json`: `@app/db`, `@app/api`, `@app/auth`, `@app/domain`, `@app/notifications` (workspace `*` versions).
  - Replace the empty `app/api/auth/[...all]/route.ts` with `toNextJsHandler(auth.handler)` per DESIGN-004 §4.10.
  - Replace the empty `app/api/trpc/[trpc]/route.ts` with the tRPC adapter wired to `appRouter` (which is empty for now — returns 404 on any call, that's fine).
- **Verification:** `pnpm --filter web build` succeeds; `pnpm --filter web dev` boots; `curl localhost:3000/api/auth/sign-in/email` returns Better Auth's "missing credentials" 4xx (proves the handler wired correctly).
- **Resume note:** app is live with auth + tRPC routing skeletons.

### Step 8 — Add testing infrastructure

- **Action:**
  - Add `@app/test-utils` package with shared testcontainers helpers:

    ```ts
    // packages/test-utils/src/postgres.ts
    import { PostgreSqlContainer } from '@testcontainers/postgresql';

    export async function startPostgres() {
      const container = await new PostgreSqlContainer('postgres:16').start();
      return { url: container.getConnectionUri(), stop: () => container.stop() };
    }
    ```

  - Add `@testcontainers/postgresql` to dev-deps.
  - Configure Vitest at root + per-package: `vitest.config.ts` with `pool: 'forks'`, `setupFiles: ['./test/setup.ts']`.
  - Add a smoke test in `packages/db/__tests__/smoke.test.ts` that spins up the container and asserts `SELECT 1` works.
  - Add Playwright config at `apps/web/playwright.config.ts` (configure `webServer: { command: 'pnpm dev' }`).
- **Verification:** `pnpm test` passes the smoke test (Postgres reachable via testcontainers).
- **Resume note:** testing infra ready for PLAN-002+ to add real tests.

### Step 9 — Document + commit

- **Action:**
  - Write `apps/web/README.md` with quickstart: clone, install pnpm, install deps, set env vars, start Postgres, run dev.
  - Add `.env.example` at root listing all expected env vars.
  - Commit:

    ```
    chore: scaffold Next.js + pnpm workspaces + Drizzle + Better Auth + tRPC (no business logic)

    PLAN-001 complete. App boots with placeholder home page; Better Auth + tRPC handlers wired but empty; Drizzle ready for schema; testcontainers smoke test passing.
    ```

- **Verification:** `git log -1` shows the commit.

## 5. Verification (end-to-end)

- [ ] `pnpm install` succeeds
- [ ] `pnpm typecheck` passes (no TS errors anywhere)
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes (testcontainers smoke test)
- [ ] `pnpm --filter web dev` boots; `localhost:3000` shows placeholder; `/api/auth/sign-in/email` returns a Better Auth 4xx; `/api/trpc/...` returns 404 (empty router)
- [ ] `pnpm --filter web build` succeeds
- [ ] One commit on the current branch

## 6. Out of scope

- Any business logic (no schemas in `packages/db/src/schema`, no procedures in `packages/api/src/routers`, no auth plugins in `packages/auth`, no UI components beyond the placeholder home page).
- CI configuration (separate plan).
- Deployment / cluster wiring (PLAN-009 territory).
- Anything from the walking-skeleton happy path (lands in PLAN-005..PLAN-008).

## 7. Risks & gotchas

- **Risk:** `pnpm create next-app` may scaffold differently across versions; the exact flags + folder layout might need tweaking. **Mitigation:** the post-condition is "Next.js App Router app exists at `apps/web/`" — exact wizard inputs are flexible.
- **Risk:** Better Auth's `drizzleAdapter` requires its own schema tables (`sessions`, `accounts`, `verification`); these get created by Better Auth's own migrations on first run. The empty `packages/db/src/schema/` here doesn't conflict. **Mitigation:** PLAN-002 will integrate Better Auth's schema declarations into the unified Drizzle schema barrel.
- **Risk:** Tailwind v4 vs. v3 differences if the wizard picks v4. **Mitigation:** accept whichever the wizard installs; revisit if it breaks shadcn/ui compatibility.
- **Risk:** testcontainers requires Docker running. **Mitigation:** README documents this; tests fail with a clear "Docker not available" if so.

## 8. Resume points

- After Step 1: workspace declared; no packages.
- After Step 2: tooling configured.
- After Step 4: Next.js app + shadcn ready.
- After Step 6: all packages skeletoned.
- After Step 7: app boots end-to-end.
- After Step 8: tests run.
- After Step 9: committed.

## 9. Open questions

| ID | Question | Lean / next action |
|----|----------|--------------------|
| Q-PLN-01 | Tailwind v3 or v4? Wizard picks one. | Accept the wizard's choice; document the version in `apps/web/README.md`. |
| Q-PLN-02 | Drizzle node-postgres adapter (`drizzle-orm/node-postgres`) vs. postgres-js (`drizzle-orm/postgres-js`)? Lean: **node-postgres** for simpler operational footprint (`pg` is widely deployed). | Use node-postgres unless ADR-004 specifies otherwise. |
| Q-PLN-03 | The `@app/*` path alias collides with potential `@app/...` package names. Lean: **acceptable** — workspaces resolve them; aliases are for `apps/web` internal imports only. | Proceed; revise if collision actually bites. |

## 10. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. 9 steps from `pnpm init` to a runnable scaffold with passing smoke test + clean commit. No business logic. |
