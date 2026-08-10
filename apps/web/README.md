# apps/web

Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui. Tailwind picked v4 from the Next.js wizard (Q-PLN-01).

The full MVP web app (v0.8.0): job posting/moderation/enrollment/completion flows, admin views with audit log, role management, invite management, SSE real-time updates, and Better Auth (credential + Google Workspace OIDC). <!-- Updated by the 2026-08 modernization audit; this file previously described the PLAN-001 scaffold. -->

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
5. Apply migrations:

   ```sh
   pnpm --filter @app/db migrate
   ```

   The migrate script reads `DATABASE_URL` from env and forwards `BOOTSTRAP_ADMIN_RECIPIENT_EMAIL`, `BOOTSTRAP_TREASURER_RECIPIENT_EMAIL`, `BOOTSTRAP_MODERATORS_RECIPIENT_EMAIL`, `BOOTSTRAP_CHAPTER_TIMEZONE`, `BOOTSTRAP_CHAPTER_DISPLAY_NAME` into `app.bootstrap_*` GUCs so the `chapter_settings` seed migration picks them up. Re-running is a no-op (`ON CONFLICT DO NOTHING`).
6. From the repo root:

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

- `/` — landing (redirects signed-in users into the app).
- `/login`, `/signup?token=…`, `/forgot-password` — auth pages (credential + SSO; see `docs/adrs/002` + `007`).
- `/jobs`, `/jobs/[jobId]`, `/jobs/new`, `/my-postings`, `/my-enrollments`, `/moderation-queue`, `/profile` — the job loop.
- `/admin` + `/admin/{users,invites,disputes,audit-log,settings}` — Admin views.
- `/api/auth/[...all]` — Better Auth handler (credential + `genericOAuth`).
- `/api/trpc/[trpc]` — tRPC fetch adapter (`jobs`/`users`/`invites`/`settings`/`admin` routers).
- `/api/events/chapter` — SSE stream; `/api/webhooks/resend` — delivery webhook; `/api/health` — probe.
