import { createServer, type IncomingMessage, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

/**
 * In-process OpenID Connect mock that satisfies Better Auth's `genericOAuth`
 * plugin (PLAN-008 §4 Step 1). Better Auth fetches discovery / token /
 * userinfo from the server side, so `page.route()` cannot intercept them;
 * pointing `OIDC_DISCOVERY_URL` at this server lets the SSO flow run end-to-end.
 *
 * Endpoints:
 *   GET  /.well-known/openid-configuration  → discovery document
 *   GET  /.well-known/jwks.json             → JWKS for id_token signature
 *   GET  /oauth/authorize                   → 302 to redirect_uri with code+state
 *   POST /oauth/token                       → access_token + signed id_token
 *   GET  /userinfo                          → seeded profile (bearer-keyed)
 *   POST /_test/profile                     → seed the next profile to return
 *   POST /_test/reset                       → clear all in-memory state
 */

export interface MockProfile {
  email: string;
  name: string;
  /** Hosted-domain claim. Set `null` to omit it (exercises HD-restriction). */
  hd?: string | null;
  /** Stable `sub` claim. Defaults to a random uuid per profile. */
  sub?: string;
  /** When true, set `email_verified: false` (exercises account-linking trust). */
  emailUnverified?: boolean;
}

export interface OidcMockServer {
  port: number;
  baseUrl: string;
  discoveryUrl: string;
  /** Cleanly stops the HTTP server and frees the port. */
  stop: () => Promise<void>;
}

export async function startOidcMockServer(): Promise<OidcMockServer> {
  const { publicKey, privateKey } = await generateKeyPair('RS256', {
    modulusLength: 2048,
    extractable: true,
  });
  const jwk = await exportJWK(publicKey);
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  jwk.kid = `oidc-mock-${randomUUID()}`;

  // code/access_token → bound profile. Codes are single-use (consumed at
  // /oauth/token); access_tokens persist until /_test/reset.
  const bindings = new Map<string, MockProfile>();
  let nextProfile: MockProfile | null = null;

  async function readBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  const server: Server = createServer(async (req, res) => {
    try {
      const host = req.headers.host ?? '127.0.0.1';
      const url = new URL(req.url ?? '/', `http://${host}`);
      const issuer = `http://${host}`;

      // Discovery
      if (req.method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            issuer,
            authorization_endpoint: `${issuer}/oauth/authorize`,
            token_endpoint: `${issuer}/oauth/token`,
            userinfo_endpoint: `${issuer}/userinfo`,
            jwks_uri: `${issuer}/.well-known/jwks.json`,
            response_types_supported: ['code'],
            grant_types_supported: ['authorization_code'],
            subject_types_supported: ['public'],
            id_token_signing_alg_values_supported: ['RS256'],
            scopes_supported: ['openid', 'email', 'profile'],
            token_endpoint_auth_methods_supported: [
              'client_secret_post',
              'client_secret_basic',
            ],
          }),
        );
        return;
      }

      // JWKS
      if (req.method === 'GET' && url.pathname === '/.well-known/jwks.json') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ keys: [jwk] }));
        return;
      }

      // Authorize → 302 back to Better Auth's callback with code+state
      if (req.method === 'GET' && url.pathname === '/oauth/authorize') {
        const redirectUri = url.searchParams.get('redirect_uri');
        const state = url.searchParams.get('state');
        if (!redirectUri || !state) {
          res.writeHead(400, { 'content-type': 'text/plain' });
          res.end('missing redirect_uri or state');
          return;
        }
        if (!nextProfile) {
          res.writeHead(400, { 'content-type': 'text/plain' });
          res.end('no profile seeded — call POST /_test/profile first');
          return;
        }
        const code = `code-${randomUUID()}`;
        const bound: MockProfile = {
          ...nextProfile,
          sub: nextProfile.sub ?? `mock-${randomUUID()}`,
        };
        bindings.set(code, bound);
        const location =
          `${redirectUri}` +
          (redirectUri.includes('?') ? '&' : '?') +
          `code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
        res.writeHead(302, { Location: location });
        res.end();
        return;
      }

      // Token exchange
      if (req.method === 'POST' && url.pathname === '/oauth/token') {
        const raw = await readBody(req);
        const params = new URLSearchParams(raw);
        const code = params.get('code');
        const clientId = params.get('client_id') ?? 'test-client';
        if (!code || !bindings.has(code)) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_grant' }));
          return;
        }
        const profile = bindings.get(code)!;
        bindings.delete(code);
        const accessToken = `at-${randomUUID()}`;
        bindings.set(accessToken, profile);

        const claims: Record<string, unknown> = {
          sub: profile.sub!,
          email: profile.email,
          email_verified: !profile.emailUnverified,
          name: profile.name,
        };
        if (profile.hd !== null && profile.hd !== undefined) {
          claims.hd = profile.hd;
        }
        const idToken = await new SignJWT(claims)
          .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
          .setIssuer(issuer)
          .setAudience(clientId)
          .setIssuedAt()
          .setExpirationTime('1h')
          .sign(privateKey);

        // Consume the seeded profile — caller must re-POST /_test/profile
        // before the next sign-in to avoid cross-test bleeding.
        nextProfile = null;

        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            access_token: accessToken,
            id_token: idToken,
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'openid email profile',
          }),
        );
        return;
      }

      // UserInfo
      if (req.method === 'GET' && url.pathname === '/userinfo') {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          res.writeHead(401);
          res.end();
          return;
        }
        const token = authHeader.slice('Bearer '.length);
        const profile = bindings.get(token);
        if (!profile) {
          res.writeHead(401);
          res.end();
          return;
        }
        const body: Record<string, unknown> = {
          sub: profile.sub!,
          email: profile.email,
          email_verified: !profile.emailUnverified,
          name: profile.name,
        };
        if (profile.hd !== null && profile.hd !== undefined) {
          body.hd = profile.hd;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
        return;
      }

      // Test control endpoints
      if (req.method === 'POST' && url.pathname === '/_test/profile') {
        const raw = await readBody(req);
        try {
          nextProfile = JSON.parse(raw) as MockProfile;
        } catch {
          res.writeHead(400, { 'content-type': 'text/plain' });
          res.end('invalid JSON');
          return;
        }
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === 'POST' && url.pathname === '/_test/reset') {
        bindings.clear();
        nextProfile = null;
        res.writeHead(204);
        res.end();
        return;
      }

      res.writeHead(404);
      res.end();
    } catch (err) {
      const message =
        err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
      // eslint-disable-next-line no-console
      console.error('[oidc-mock] unhandled error', message);
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(message);
    }
  });

  // OS-assigned port + unref so it doesn't block process exit if teardown
  // misfires (PLAN-008 Trap 1: "mock-server lifecycle clean across runs").
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('OIDC mock failed to bind a port');
  }
  const port = addr.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    port,
    baseUrl,
    discoveryUrl: `${baseUrl}/.well-known/openid-configuration`,
    async stop() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
