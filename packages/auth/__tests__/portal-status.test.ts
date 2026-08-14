import { describe, expect, it } from 'vitest';
import {
  MEMBER_STATUSES,
  memberStatusUrl,
  parseMemberStatus,
  resolvePortalApiBaseUrl,
  roleToStatus,
  statusToRole,
} from '../src/portal-status';

describe('ADR-014 member status parsing + projection', () => {
  it('parseMemberStatus accepts only the two contract values (null = undeclared)', () => {
    for (const status of MEMBER_STATUSES) {
      expect(parseMemberStatus(status)).toBe(status);
    }
    expect(parseMemberStatus('Active')).toBeNull();
    expect(parseMemberStatus('ALUMNI')).toBeNull();
    expect(parseMemberStatus('')).toBeNull();
    expect(parseMemberStatus(null)).toBeNull();
    expect(parseMemberStatus(undefined)).toBeNull();
    expect(parseMemberStatus(1)).toBeNull();
  });

  it('projects status onto the Active/Alumni partition only', () => {
    expect(statusToRole('active')).toBe('Active');
    expect(statusToRole('alumni')).toBe('Alumni');
  });

  it('roleToStatus inverts on the partition and is null for privileged roles', () => {
    expect(roleToStatus('Active')).toBe('active');
    expect(roleToStatus('Alumni')).toBe('alumni');
    expect(roleToStatus('Moderator')).toBeNull();
    expect(roleToStatus('Admin')).toBeNull();
  });
});

describe('ADR-014 portal API base URL from OIDC_DISCOVERY_URL (no new env var)', () => {
  it('is the origin of the discovery URL', () => {
    expect(
      resolvePortalApiBaseUrl(
        'https://sigoalumni.org/.well-known/openid-configuration',
      ),
    ).toBe('https://sigoalumni.org');
    expect(
      resolvePortalApiBaseUrl(
        'http://127.0.0.1:39231/.well-known/openid-configuration',
      ),
    ).toBe('http://127.0.0.1:39231');
  });

  it('follows the issuer cutover (Cloud Run origin today, sigoalumni.org later)', () => {
    expect(
      resolvePortalApiBaseUrl(
        'https://frontpage-abc123-uc.a.run.app/.well-known/openid-configuration',
      ),
    ).toBe('https://frontpage-abc123-uc.a.run.app');
  });

  it('is null when unset or unparseable (OIDC off ⇒ status feature off)', () => {
    expect(resolvePortalApiBaseUrl(undefined)).toBeNull();
    expect(resolvePortalApiBaseUrl('')).toBeNull();
    expect(resolvePortalApiBaseUrl('not a url')).toBeNull();
  });

  it('memberStatusUrl appends the contract path', () => {
    expect(memberStatusUrl('https://sigoalumni.org')).toBe(
      'https://sigoalumni.org/api/member/status',
    );
  });
});
