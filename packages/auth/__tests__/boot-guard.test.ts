import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// S-00 (AUDIT-2026-08): the auth config must refuse to boot in production
// when BETTER_AUTH_SECRET / BETTER_AUTH_URL are unset, and must never fall
// back to a baked-in secret. The guard runs at module scope in
// `src/config.ts`, so each case re-imports the module with a reset registry.

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe('S-00 production boot guard', () => {
  it('throws in production when BETTER_AUTH_SECRET is unset', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'production',
      BETTER_AUTH_URL: 'https://example.test',
    };
    delete process.env.BETTER_AUTH_SECRET;

    await expect(import('../src/config')).rejects.toThrow(
      'BETTER_AUTH_SECRET must be set in production',
    );
  });

  it('throws in production when BETTER_AUTH_URL is unset', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'production',
      BETTER_AUTH_SECRET: 'a-real-secret-from-the-environment',
    };
    delete process.env.BETTER_AUTH_URL;

    await expect(import('../src/config')).rejects.toThrow(
      'BETTER_AUTH_URL must be set in production',
    );
  });

  it('does not throw during `next build` page-data collection (NEXT_PHASE)', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'production',
      NEXT_PHASE: 'phase-production-build',
    };
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.BETTER_AUTH_URL;

    const mod = await import('../src/config');
    expect(mod.auth).toBeDefined();
  });

  it('boots outside production without the vars (dev ergonomics)', async () => {
    process.env = { ...ORIGINAL_ENV, NODE_ENV: 'test' };
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.BETTER_AUTH_URL;

    const mod = await import('../src/config');
    expect(mod.auth).toBeDefined();
  });

  it('never bakes in the removed fallback secret', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(
      new URL('../src/config.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toContain('dev-only-not-for-prod');
  });
});
