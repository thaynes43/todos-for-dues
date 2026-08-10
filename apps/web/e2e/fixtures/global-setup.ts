import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { FullConfig } from '@playwright/test';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { startOidcMockServer, type OidcMockServer } from './oidc-mock-server';
import { seedFixtures } from './seed-chapter';
import { writeRuntimeEnv, type RuntimeEnv } from './runtime-env';

const TMP_DIR = join(process.cwd(), '.playwright-tmp');
const DEV_URL = 'http://localhost:3000';
const DEV_READY_TIMEOUT_MS = 180_000;

interface GlobalState {
  pg?: StartedPostgreSqlContainer;
  oidc?: OidcMockServer;
  dev?: ChildProcess;
}

const state: GlobalState = {};
(globalThis as unknown as { __PLAYWRIGHT_E2E_STATE__?: GlobalState }).__PLAYWRIGHT_E2E_STATE__ =
  state;

const ADMIN_EMAIL = 'admin@chapter.test';
const MODERATOR_EMAIL = 'standing-mod@chapter.test';

const TREASURER_EMAIL = 'treasurer@chapter.test';
const MODERATORS_RECIPIENT_EMAIL = 'mods@chapter.test';
const ADMIN_RECIPIENT_EMAIL = 'admins@chapter.test';
const CHAPTER_DISPLAY_NAME = 'Test Chapter';
const CHAPTER_TIMEZONE = 'America/New_York';

// Mirrors the live portal client registration (client id `todos-for-dues`,
// confidential; secret is test-only here).
const OIDC_CLIENT_ID = 'todos-for-dues';
const OIDC_CLIENT_SECRET = 'test-portal-client-secret';

async function waitForReady(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown = undefined;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'GET' });
      // Any response (including 5xx from missing routes) means the server
      // process is up and accepting connections.
      if (res.status < 600) return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Timed out (${timeoutMs}ms) waiting for ${url}; last error: ${String(
      lastErr,
    )}`,
  );
}

/**
 * Pre-compile every route a spec might hit. Next.js's dev server compiles
 * routes on first request — on a cold GHA runner that first-hit cost can
 * exceed the per-spec timeout (button stays `disabled` past 30s, etc.).
 * Issuing a single GET to each route during globalSetup amortises the
 * compile cost once, so individual specs see warm responses.
 *
 * Dynamic routes like `/jobs/[jobId]` are warmed by hitting a zero-UUID
 * placeholder — the route MODULE is compiled regardless of param value;
 * the handler will return notFound but that's the same module.
 */
async function prewarmRoutes(baseUrl: string): Promise<void> {
  const placeholderId = '00000000-0000-0000-0000-000000000000';
  const routes = [
    '/',
    '/login',
    '/profile',
    '/jobs',
    '/jobs/new',
    `/jobs/${placeholderId}`,
    '/my-postings',
    '/my-enrollments',
    '/moderation-queue',
    '/admin',
    '/admin/users',
    `/admin/users/${placeholderId}`,
    `/admin/jobs/${placeholderId}`,
    '/admin/disputes',
    '/admin/settings',
    '/admin/audit-log',
    '/api/health',
  ];
  const start = Date.now();
  await Promise.all(
    routes.map((path) =>
      fetch(baseUrl + path, { redirect: 'manual' }).catch(() => undefined),
    ),
  );
  // eslint-disable-next-line no-console
  console.log(
    `[e2e] prewarm: ${routes.length} routes compiled in ${Date.now() - start}ms`,
  );
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }

  // ── Postgres testcontainer ────────────────────────────────────────────
  // Direct testcontainers import (not @app/test-utils) so Playwright's CJS
  // TS loader doesn't have to traverse our ESM workspace packages.
  const pg = await new PostgreSqlContainer('postgres:16').start();
  state.pg = pg;
  const databaseUrl = pg.getConnectionUri();

  // ── Migrations as subprocess ─────────────────────────────────────────
  const migrate = spawnSync('pnpm', ['--filter', '@app/db', 'migrate'], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      BOOTSTRAP_ADMIN_RECIPIENT_EMAIL: ADMIN_RECIPIENT_EMAIL,
      BOOTSTRAP_TREASURER_RECIPIENT_EMAIL: TREASURER_EMAIL,
      BOOTSTRAP_MODERATORS_RECIPIENT_EMAIL: MODERATORS_RECIPIENT_EMAIL,
      BOOTSTRAP_CHAPTER_TIMEZONE: CHAPTER_TIMEZONE,
      BOOTSTRAP_CHAPTER_DISPLAY_NAME: CHAPTER_DISPLAY_NAME,
    },
    stdio: 'inherit',
  });
  if (migrate.status !== 0) {
    throw new Error(`Migrations failed (exit ${migrate.status})`);
  }

  // ── Portal-shaped OIDC mock (ADR-013) ────────────────────────────────
  // Starts before seeding: seedFixtures registers the global personas'
  // portal identities against it.
  const oidc = await startOidcMockServer({
    clientId: OIDC_CLIENT_ID,
    clientSecret: OIDC_CLIENT_SECRET,
  });
  state.oidc = oidc;

  await seedFixtures({
    databaseUrl,
    adminEmail: ADMIN_EMAIL,
    moderatorEmail: MODERATOR_EMAIL,
    portalMockUrl: oidc.baseUrl,
  });

  // ── Persist runtime env for workers ──────────────────────────────────
  const runtimeEnv: RuntimeEnv = {
    DATABASE_URL: databaseUrl,
    OIDC_DISCOVERY_URL: oidc.discoveryUrl,
    OIDC_BASE_URL: oidc.baseUrl,
    OIDC_CLIENT_ID,
    OIDC_CLIENT_SECRET,
    BETTER_AUTH_SECRET:
      'test-better-auth-secret-not-for-prod-not-for-prod-not-for-prod',
    BETTER_AUTH_URL: DEV_URL,
    BOOTSTRAP_TREASURER_RECIPIENT_EMAIL: TREASURER_EMAIL,
    BOOTSTRAP_MODERATORS_RECIPIENT_EMAIL: MODERATORS_RECIPIENT_EMAIL,
    BOOTSTRAP_ADMIN_RECIPIENT_EMAIL: ADMIN_RECIPIENT_EMAIL,
    BOOTSTRAP_CHAPTER_DISPLAY_NAME: CHAPTER_DISPLAY_NAME,
    BOOTSTRAP_CHAPTER_TIMEZONE: CHAPTER_TIMEZONE,
    RESEND_TEST_MODE: 'true',
    E2E_SEED_ADMIN_EMAIL: ADMIN_EMAIL,
    E2E_SEED_MODERATOR_EMAIL: MODERATOR_EMAIL,
  };
  for (const [k, v] of Object.entries(runtimeEnv)) {
    process.env[k] = v;
  }
  writeRuntimeEnv(runtimeEnv);

  // ── Dev server ───────────────────────────────────────────────────────
  // Playwright's `webServer` plugin setup runs BEFORE globalSetup (see the
  // ordering in runner createGlobalSetupTasks), so it would launch with a
  // stale env. We manage the dev server here instead, fed the testcontainer's
  // DATABASE_URL and the OIDC mock's discovery URL.
  //
  // Spawn `node_modules/.bin/next dev` directly rather than going through
  // pnpm — some pnpm versions filter env vars between script and child.
  const dev = spawn(join(process.cwd(), 'node_modules', '.bin', 'next'), ['dev'], {
    env: { ...process.env, ...runtimeEnv },
    cwd: process.cwd(),
    stdio: 'inherit',
    detached: false,
  });
  state.dev = dev;
  dev.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      // eslint-disable-next-line no-console
      console.error(`[e2e] dev server exited unexpectedly (code=${code}, signal=${signal ?? 'none'})`);
    }
  });

  await waitForReady(DEV_URL, DEV_READY_TIMEOUT_MS);

  // Compile every spec-facing route once before specs start. On cold GHA
  // runners route compile-lag was tripping per-spec timeouts (e.g. lock-job
  // submit button stayed disabled past 30s while /jobs/[id] compiled).
  await prewarmRoutes(DEV_URL);

  // eslint-disable-next-line no-console
  console.log(
    `[e2e] globalSetup ready: pg=${databaseUrl} oidc=${oidc.baseUrl} dev=${DEV_URL}`,
  );
}
