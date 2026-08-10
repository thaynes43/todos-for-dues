import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';
import { eq } from 'drizzle-orm';
import { db, users, session, account, verification } from '@app/db';
import { enforceHdRestriction } from './hooks/hd-restriction';
import { bootstrapAdminOnSignin } from './hooks/bootstrap-admin';

const DEFAULT_OIDC_DISCOVERY_URL =
  'https://accounts.google.com/.well-known/openid-configuration';
const OIDC_PROVIDER_ID = 'google-workspace';

const oidcClientId = process.env.OIDC_CLIENT_ID;
const oidcClientSecret = process.env.OIDC_CLIENT_SECRET;
const oidcHostedDomain = process.env.OIDC_HOSTED_DOMAIN;

export const oidcEnabled = Boolean(
  oidcClientId && oidcClientSecret && oidcHostedDomain,
);

const oidcPlugins = oidcEnabled
  ? [
      genericOAuth({
        config: [
          {
            providerId: OIDC_PROVIDER_ID,
            clientId: oidcClientId!,
            clientSecret: oidcClientSecret!,
            discoveryUrl:
              process.env.OIDC_DISCOVERY_URL ?? DEFAULT_OIDC_DISCOVERY_URL,
            scopes: ['openid', 'email', 'profile'],
            authorizationUrlParams: { hd: oidcHostedDomain! },
            mapProfileToUser: (profile) => {
              // HD restriction fires here, before Better Auth creates a user row
              // (PRD-003 R-04 / AC-02). Throwing aborts the OAuth callback.
              enforceHdRestriction({
                providerId: OIDC_PROVIDER_ID,
                profile: {
                  email: typeof profile.email === 'string' ? profile.email : null,
                  hd: typeof profile.hd === 'string' ? profile.hd : null,
                },
                expectedHostedDomain: oidcHostedDomain,
              });
              return {
                email: profile.email,
                name: profile.name,
                emailVerified: true,
                role: 'Alumni',
              };
            },
          },
        ],
      }),
    ]
  : [];

// S-00 (AUDIT-2026-08): never fall back to a baked-in secret. In production a
// missing secret/base URL is a fatal misconfiguration — refuse to boot.
if (process.env.NODE_ENV === 'production') {
  for (const name of ['BETTER_AUTH_SECRET', 'BETTER_AUTH_URL'] as const) {
    if (!process.env[name]) {
      throw new Error(`${name} must be set in production`);
    }
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
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: [OIDC_PROVIDER_ID],
      // Our credential-signup flow has no email-verification UI (out of MVP
      // scope), so credential users persist with `email_verified=false`.
      // Without this override Better Auth would refuse to auto-link a
      // trusted OIDC sign-in to an existing unverified credential user
      // (link-account.mjs: `requireLocalEmailVerified ?? true`), even though
      // the design intent (PRD-003 R-09) is that trustedProviders just-works.
      requireLocalEmailVerified: false,
    },
  },
  // nextCookies MUST be the last plugin — it captures Set-Cookie headers from
  // Better Auth's internal responses and forwards them through Next.js's
  // cookies() API so Server Action sign-in/up flows actually persist the
  // session cookie back to the browser (PLAN-006 follow-up).
  plugins: [...oidcPlugins, nextCookies()],
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  databaseHooks: {
    session: {
      create: {
        after: async (sessionRow) => {
          // Bootstrap-admin fires on every sign-in (session create) — idempotent.
          // Routes through transitionRole from @app/domain (PLAN-003 invariant).
          const userId = sessionRow.userId as string;
          const [row] = await db
            .select({ email: users.email })
            .from(users)
            .where(eq(users.id, userId));
          if (!row) return;
          await bootstrapAdminOnSignin({ id: userId, email: row.email });
        },
      },
    },
  },
});

export type Auth = typeof auth;
