import { HdRestrictionError } from '../errors';

export interface HdRestrictionInput {
  providerId: string;
  profile: { email?: string | null; hd?: string | null };
  expectedHostedDomain: string | undefined;
}

/**
 * HD restriction per ADR-007. Verifies both the OIDC `hd` claim and the email
 * domain match the configured `OIDC_HOSTED_DOMAIN`. Throws before any user row
 * is created (PRD-003 R-04 / AC-02). Only enforced for `providerId =
 * 'google-workspace'`; other providers (if added later) pass through.
 */
export function enforceHdRestriction(input: HdRestrictionInput): void {
  if (input.providerId !== 'google-workspace') return;
  const expected = input.expectedHostedDomain;
  if (!expected) {
    throw new Error(
      'OIDC_HOSTED_DOMAIN is required when google-workspace OIDC is configured',
    );
  }
  const email = input.profile.email ?? '';
  const hd = input.profile.hd ?? null;
  const hdMatches = hd === expected;
  const emailMatches = email.toLowerCase().endsWith(`@${expected.toLowerCase()}`);
  if (!hdMatches || !emailMatches) {
    throw new HdRestrictionError(
      `Email ${email || '<missing>'} is not in the configured hosted domain '${expected}'`,
    );
  }
}
