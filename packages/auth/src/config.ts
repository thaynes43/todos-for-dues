import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';
import { db, users, session, account, verification } from '@app/db';
import {
  PORTAL_PROVIDER_ID,
  mapTierToRole,
  parsePortalTier,
} from './portal-tiers';
import { parseMemberStatus, statusToRole } from './portal-status';
import {
  refuseNonMemberUserCreate,
  syncPortalClaimsOnSessionCreate,
} from './hooks/claim-sync';

// ADR-013: the sigoalumni.org portal is the only identity source. Discovery
// comes from OIDC_DISCOVERY_URL — currently the portal's Cloud Run origin
// (https://frontpage-….a.run.app/.well-known/openid-configuration).
// TODO(cutover): at launch the issuer moves to https://sigoalumni.org —
// update the env value (Phase 4 ExternalSecret), not this code.
const oidcClientId = process.env.OIDC_CLIENT_ID;
const oidcClientSecret = process.env.OIDC_CLIENT_SECRET;
const oidcDiscoveryUrl = process.env.OIDC_DISCOVERY_URL;

export const oidcEnabled = Boolean(
  oidcClientId && oidcClientSecret && oidcDiscoveryUrl,
);

const oidcPlugins = oidcEnabled
  ? [
      genericOAuth({
        config: [
          {
            providerId: PORTAL_PROVIDER_ID,
            clientId: oidcClientId!,
            clientSecret: oidcClientSecret!,
            discoveryUrl: oidcDiscoveryUrl!,
            // Portal client registration: authorization code + PKCE S256 only.
            pkce: true,
            scopes: ['openid', 'profile', 'email', 'offline_access'],
            mapProfileToUser: (profile) => {
              // The portal puts sub/email/name/tier/capabilities (and, once
              // backlog item 07 ships, `status`) in the id_token (ADR 0007 —
              // claims travel in the token), which is what Better Auth hands
              // us here. Map tier → app role (ADR-013 §mapping); pending /
              // unknown tiers map to the 'refused' sentinel, which
              // refuseNonMemberUserCreate rejects BEFORE any user row is
              // created. For `brother`, a DECLARED `status` claim picks the
              // Active/Alumni side of the partition at first sign-in
              // (ADR-014); absent/null keeps the pre-status default (Alumni).
              const tier = parsePortalTier(profile.tier);
              const status = parseMemberStatus(profile.status);
              const role =
                tier === 'brother' && status
                  ? statusToRole(status)
                  : tier
                    ? mapTierToRole(tier)
                    : 'refused';
              return {
                email: typeof profile.email === 'string' ? profile.email : undefined,
                name: typeof profile.name === 'string' ? profile.name : undefined,
                emailVerified: true,
                role,
              };
            },
          },
        ],
      }),
    ]
  : [];

// S-00 (AUDIT-2026-08): never fall back to a baked-in secret. In production a
// missing secret/base URL is a fatal misconfiguration — refuse to boot.
// `next build` imports route modules for page-data collection with
// NODE_ENV=production and no runtime secrets; Next marks that phase via
// NEXT_PHASE, and the real server (standalone runtime) never sets it, so the
// guard still fires on actual boot.
const isNextBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
if (process.env.NODE_ENV === 'production' && !isNextBuildPhase) {
  for (const name of ['BETTER_AUTH_SECRET', 'BETTER_AUTH_URL'] as const) {
    if (!process.env[name]) {
      throw new Error(`${name} must be set in production`);
    }
  }
  if (!oidcEnabled) {
    // Fail closed, boot anyway (ADR-013): with no portal client config there
    // is no sign-in path at all — /login says so. Terse operator note:
    console.error(
      '[auth] portal SSO disabled — set OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, ' +
        'OIDC_DISCOVERY_URL (sigoalumni.org portal client). Sign-in is unavailable until then.',
    );
  }
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  // No fallback: when unset outside production, Better Auth's own dev-mode
  // handling applies (loud warning); production is guarded above.
  secret: process.env.BETTER_AUTH_SECRET,
  advanced: {
    // UUID id columns (DESIGN-001) — let Postgres generate via gen_random_uuid().
    database: { generateId: 'uuid' },
  },
  database: drizzleAdapter(db, {
    provider: 'pg',
    // Key by modelName so the adapter's getSchema(model) lookup resolves:
    // user model → `users` Drizzle table (matches options.user.modelName).
    schema: { users, session, account, verification },
  }),
  user: {
    modelName: 'users',
    fields: {
      name: 'displayName',
    },
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'Active',
      },
    },
  },
  // No emailAndPassword: the portal is the only identity source (ADR-013).
  // The `account`/`verification` tables stay — Better Auth expects them —
  // and `account.password` is dormant.
  //
  // nextCookies MUST be the last plugin — it captures Set-Cookie headers from
  // Better Auth's internal responses and forwards them through Next.js's
  // cookies() API so the session cookie persists back to the browser
  // (PLAN-006 follow-up).
  plugins: [...oidcPlugins, nextCookies()],
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  databaseHooks: {
    user: {
      create: {
        // Pending / unknown portal tiers never get a user row (ADR-013).
        before: async (user) => {
          refuseNonMemberUserCreate(user);
        },
      },
    },
    session: {
      create: {
        // Every sign-in re-runs the tier → role mapping (ADR 0007 C-3) and
        // refuses pending members. Throwing here aborts the OAuth callback
        // before a session row exists.
        before: async (sessionRow) => {
          await syncPortalClaimsOnSessionCreate({
            userId: sessionRow.userId as string,
          });
        },
      },
    },
  },
});

export type Auth = typeof auth;
