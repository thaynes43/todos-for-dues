import { describe, expect, it } from 'vitest';
import {
  PORTAL_PROVIDER_ID,
  PORTAL_TIERS,
  isAppRole,
  mapTierToRole,
  parsePortalTier,
  tierAllowsRole,
} from '../src/portal-tiers';

describe('ADR-013 portal tier → app role mapping', () => {
  it('maps the four tiers per the adopted default', () => {
    expect(mapTierToRole('admin')).toBe('Admin');
    expect(mapTierToRole('operator')).toBe('Moderator');
    expect(mapTierToRole('brother')).toBe('Alumni');
    expect(mapTierToRole('pending')).toBe('refused');
  });

  it('parsePortalTier accepts only known tiers (fail closed)', () => {
    for (const tier of PORTAL_TIERS) {
      expect(parsePortalTier(tier)).toBe(tier);
    }
    expect(parsePortalTier('Brother')).toBeNull();
    expect(parsePortalTier('owner')).toBeNull();
    expect(parsePortalTier('')).toBeNull();
    expect(parsePortalTier(undefined)).toBeNull();
    expect(parsePortalTier(42)).toBeNull();
  });

  it('brother tolerates the app-granted Active role (plan §2.0)', () => {
    expect(tierAllowsRole('brother', 'Alumni')).toBe(true);
    expect(tierAllowsRole('brother', 'Active')).toBe(true);
    expect(tierAllowsRole('brother', 'Moderator')).toBe(false);
    expect(tierAllowsRole('brother', 'Admin')).toBe(false);
  });

  it('elevated tiers require their exact role', () => {
    expect(tierAllowsRole('operator', 'Moderator')).toBe(true);
    expect(tierAllowsRole('operator', 'Alumni')).toBe(false);
    expect(tierAllowsRole('admin', 'Admin')).toBe(true);
    expect(tierAllowsRole('admin', 'Moderator')).toBe(false);
  });

  it('isAppRole gates the user-create sentinel', () => {
    expect(isAppRole('Alumni')).toBe(true);
    expect(isAppRole('refused')).toBe(false);
    expect(isAppRole(undefined)).toBe(false);
  });

  it('provider id matches the registered redirect URI segment', () => {
    expect(PORTAL_PROVIDER_ID).toBe('sigo-portal');
  });
});
