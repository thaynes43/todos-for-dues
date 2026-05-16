import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Shared on-disk handoff between Playwright globalSetup and the test workers
// (workers don't inherit process.env mutations made inside globalSetup
// reliably across Playwright versions, so we also persist to disk).
//
// Path is relative to process.cwd() — Playwright always runs from apps/web,
// and we keep the file alongside the rest of the .playwright-* artifacts.
const TMP_DIR = join(process.cwd(), '.playwright-tmp');
const ENV_FILE = join(TMP_DIR, 'env.json');

export interface RuntimeEnv {
  DATABASE_URL: string;
  OIDC_DISCOVERY_URL: string;
  OIDC_BASE_URL: string;
  OIDC_CLIENT_ID: string;
  OIDC_CLIENT_SECRET: string;
  OIDC_HOSTED_DOMAIN: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  BOOTSTRAP_ADMIN_EMAIL: string;
  BOOTSTRAP_TREASURER_RECIPIENT_EMAIL: string;
  BOOTSTRAP_MODERATORS_RECIPIENT_EMAIL: string;
  BOOTSTRAP_ADMIN_RECIPIENT_EMAIL: string;
  BOOTSTRAP_CHAPTER_DISPLAY_NAME: string;
  BOOTSTRAP_CHAPTER_TIMEZONE: string;
  RESEND_TEST_MODE: 'true';
  /** Pre-seeded credential password for Admin + Moderator personas. */
  E2E_SEED_PASSWORD: string;
  /** Pre-seeded Moderator email. */
  E2E_SEED_MODERATOR_EMAIL: string;
}

export function writeRuntimeEnv(env: RuntimeEnv): void {
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(ENV_FILE, JSON.stringify(env, null, 2), 'utf8');
}

export function readRuntimeEnv(): RuntimeEnv {
  if (!existsSync(ENV_FILE)) {
    throw new Error(
      `Runtime env file ${ENV_FILE} not found — is Playwright's globalSetup running?`,
    );
  }
  return JSON.parse(readFileSync(ENV_FILE, 'utf8')) as RuntimeEnv;
}

export function envFilePath(): string {
  return ENV_FILE;
}
