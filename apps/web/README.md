# apps/web

Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui. Tailwind picked v4 from the Next.js wizard (Q-PLN-01).

This is the scaffolded MVP shell from PLAN-001 — placeholder home page, Better Auth + tRPC handlers wired but with no procedures or plugins. Business logic lands in PLAN-002 onward.

## Quickstart

1. Install Node ≥ 20, pnpm ≥ 9, and a running Docker daemon (Docker Desktop, Colima, or Orbstack).
2. From the repo root: `pnpm install`.
3. Start a local Postgres 16:

   ```sh
   docker run -d --name tfd-dev-pg \
     -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=todos \
     -p 5432:5432 postgres:16
   ```

4. Copy `.env.example` → `.env.local` at the repo root and fill in `DATABASE_URL` + `BETTER_AUTH_SECRET` (≥ 32 chars).
5. From the repo root:

   ```sh
   pnpm --filter web dev          # http://localhost:3000
   ```

## Verification

```sh
pnpm typecheck                    # all packages
pnpm lint                         # all packages
pnpm test                         # testcontainers smoke test (needs Docker)
pnpm --filter web build           # production build
```

## Routes

- `/` — placeholder home page.
- `/api/auth/[...all]` — Better Auth catch-all (empty plugins; full wiring in PLAN-004).
- `/api/trpc/[trpc]` — tRPC fetch adapter against an empty `appRouter` (procedures land in PLAN-005).
