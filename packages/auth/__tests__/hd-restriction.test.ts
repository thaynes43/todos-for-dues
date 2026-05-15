import { describe, expect, it } from 'vitest';
import { enforceHdRestriction } from '../src/hooks/hd-restriction';
import { HdRestrictionError } from '../src/errors';

describe('enforceHdRestriction (ADR-007 / DESIGN-004 §4.2)', () => {
  const expectedHostedDomain = 'spo-uml.example.invalid';

  it('passes when hd + email both match', () => {
    expect(() =>
      enforceHdRestriction({
        providerId: 'google-workspace',
        profile: { hd: expectedHostedDomain, email: `alice@${expectedHostedDomain}` },
        expectedHostedDomain,
      }),
    ).not.toThrow();
  });

  it('rejects when hd claim is missing', () => {
    expect(() =>
      enforceHdRestriction({
        providerId: 'google-workspace',
        profile: { hd: null, email: `alice@${expectedHostedDomain}` },
        expectedHostedDomain,
      }),
    ).toThrow(HdRestrictionError);
  });

  it('rejects when hd claim does not match', () => {
    expect(() =>
      enforceHdRestriction({
        providerId: 'google-workspace',
        profile: { hd: 'other.example.invalid', email: `alice@${expectedHostedDomain}` },
        expectedHostedDomain,
      }),
    ).toThrow(HdRestrictionError);
  });

  it('rejects when email domain does not match', () => {
    expect(() =>
      enforceHdRestriction({
        providerId: 'google-workspace',
        profile: { hd: expectedHostedDomain, email: 'alice@other.example.invalid' },
        expectedHostedDomain,
      }),
    ).toThrow(HdRestrictionError);
  });

  it('case-insensitive on email domain', () => {
    expect(() =>
      enforceHdRestriction({
        providerId: 'google-workspace',
        profile: { hd: expectedHostedDomain, email: `Alice@${expectedHostedDomain.toUpperCase()}` },
        expectedHostedDomain,
      }),
    ).not.toThrow();
  });

  it('passes through (no-op) for non-google-workspace providers', () => {
    expect(() =>
      enforceHdRestriction({
        providerId: 'github',
        profile: { hd: null, email: 'alice@gmail.com' },
        expectedHostedDomain,
      }),
    ).not.toThrow();
  });

  it('throws a hard error when OIDC_HOSTED_DOMAIN is not configured', () => {
    expect(() =>
      enforceHdRestriction({
        providerId: 'google-workspace',
        profile: { hd: 'whatever', email: 'alice@whatever' },
        expectedHostedDomain: undefined,
      }),
    ).toThrow(/OIDC_HOSTED_DOMAIN is required/);
  });
});
