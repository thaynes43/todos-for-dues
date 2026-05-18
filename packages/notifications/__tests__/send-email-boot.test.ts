import { afterEach, describe, expect, it, vi } from 'vitest';

import { assertValidResendFromAddressOrThrow } from '../src/send-email';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('assertValidResendFromAddressOrThrow()', () => {
  it('throws in production when RESEND_FROM_ADDRESS is unset', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESEND_FROM_ADDRESS', '');
    expect(() => assertValidResendFromAddressOrThrow()).toThrow(
      /placeholder|@todos-for-dues\.app/i,
    );
  });

  it('throws in production when RESEND_FROM_ADDRESS uses the placeholder domain', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESEND_FROM_ADDRESS', 'noreply@todos-for-dues.app');
    expect(() => assertValidResendFromAddressOrThrow()).toThrow(
      /placeholder|@todos-for-dues\.app/i,
    );
  });

  it('throws in production when placeholder appears inside a display-name wrapped address', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv(
      'RESEND_FROM_ADDRESS',
      'TODOs for Dues <noreply@todos-for-dues.app>',
    );
    expect(() => assertValidResendFromAddressOrThrow()).toThrow(
      /placeholder|@todos-for-dues\.app/i,
    );
  });

  it('does NOT throw in production when RESEND_FROM_ADDRESS is a real verified-domain address', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESEND_FROM_ADDRESS', 'hello@chapter.example');
    expect(() => assertValidResendFromAddressOrThrow()).not.toThrow();
  });

  it('does NOT throw when NODE_ENV=test, even if FROM is missing (the gate is the safety belt)', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('RESEND_FROM_ADDRESS', '');
    expect(() => assertValidResendFromAddressOrThrow()).not.toThrow();
  });

  it('does NOT throw when NODE_ENV=test with the placeholder set', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('RESEND_FROM_ADDRESS', 'noreply@todos-for-dues.app');
    expect(() => assertValidResendFromAddressOrThrow()).not.toThrow();
  });

  it('does NOT throw in development with placeholder set', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('RESEND_FROM_ADDRESS', 'noreply@todos-for-dues.app');
    expect(() => assertValidResendFromAddressOrThrow()).not.toThrow();
  });

  it('does NOT throw during `next build` page-data collection (NEXT_PHASE=phase-production-build)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    vi.stubEnv('RESEND_FROM_ADDRESS', '');
    expect(() => assertValidResendFromAddressOrThrow()).not.toThrow();
  });

  it('throws on real production server boot (NEXT_PHASE=phase-production-server) with placeholder', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PHASE', 'phase-production-server');
    vi.stubEnv('RESEND_FROM_ADDRESS', 'noreply@todos-for-dues.app');
    expect(() => assertValidResendFromAddressOrThrow()).toThrow(
      /placeholder|@todos-for-dues\.app/i,
    );
  });
});
