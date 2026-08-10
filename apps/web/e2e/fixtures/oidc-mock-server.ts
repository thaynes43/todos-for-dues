import { createServer, type IncomingMessage, type Server } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

/**
 * In-process, portal-shaped OpenID Connect mock (ADR-013). Mirrors the
 * sigoalumni.org portal's provider contract so the suite stays green without
 * the live portal:
 *
 *   - authorization code + PKCE S256 ONLY (token exchange rejects a missing
 *     or mismatched code_verifier — proves the app's `pkce: true` config);
 *   - confidential client (client_secret checked, post or basic);
 *   - claims sub / email / name / `tier` / `capabilities` in BOTH the
 *     id_token and userinfo;
 *   - refresh grant returns access tokens ONLY (no id_token / no rotation),
 *     like the portal;
 *   - the authorize endpoint renders a tiny "members door" page with an email
 *     field — identity selection is per-browser-session, so parallel
 *     Playwright workers never race a shared "next profile" slot.
 *
 * Better Auth fetches discovery / token / userinfo server-side, so
 * `page.route()` cannot intercept them; pointing `OIDC_DISCOVERY_URL` at this
 * server lets the SSO flow run end-to-end.
 *
 * Endpoints:
 *   GET  /.well-known/openid-configuration  → discovery document
 *   GET  /.well-known/jwks.json             → JWKS for id_token signature
 *   GET  /oauth/authorize                   → members-door HTML (email form)
 *   POST /oauth/authorize                   → 302 to redirect_uri with code+state
 *   POST /oauth/token                       → code→tokens / refresh→access only
 *   GET  /userinfo                          → identity claims (bearer-keyed)
 *   POST /_test/identity                    → upsert an identity (keyed by email)
 *   POST /_test/reset                       → clear all in-memory state
 */

export interface PortalIdentity {
  email: string;
  name: string;
  /** Portal tier claim. The control endpoint accepts any string so specs can
   * exercise unknown-tier fail-closed behavior. */
  tier: string;
  /** Capability claims (e.g. ['organizer']). Defaults to []. */
  capabilities?: string[];
  /** Stable `sub` claim. Defaults to a random uuid at registration. */
  sub?: string;
}

export interface OidcMockServer {
  port: number;
  baseUrl: string;
  discoveryUrl: string;
  /** Cleanly stops the HTTP server and frees the port. */
  stop: () => Promise<void>;
}

export interface OidcMockOptions {
  /** Registered confidential client — token requests must present these. */
  clientId: string;
  clientSecret: string;
}

interface CodeGrant {
  identity: Required<PortalIdentity>;
  codeChallenge: string;
  nonce: string | null;
  clientId: string;
}

function s256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function membersDoorHtml(params: URLSearchParams): string {
  const hidden = [
    'redirect_uri',
    'state',
    'code_challenge',
    'code_challenge_method',
    'nonce',
    'client_id',
    'scope',
  ]
    .map((k) => {
      const v = params.get(k);
      return v === null
        ? ''
        : `<input type="hidden" name="${k}" value="${v.replace(/"/g, '&quot;')}">`;
    })
    .join('\n      ');
  return `<!doctype html>
<html><head><title>Sigo Alumni — members door (mock)</title></head>
<body>
  <main>
    <h1>Sigo Alumni</h1>
    <p>Members door (e2e mock). Enter a registered identity email.</p>
    <form method="post" action="/oauth/authorize">
      ${hidden}
      <label>Email
        <input type="email" name="email" data-testid="portal-email" autofocus>
      </label>
      <button type="submit" data-testid="portal-continue">Continue</button>
    </form>
  </main>
</body></html>`;
}

export async function startOidcMockServer(
  options: OidcMockOptions,
): Promise<OidcMockServer> {
  const { publicKey, privateKey } = await generateKeyPair('RS256', {
    modulusLength: 2048,
    extractable: true,
  });
  const jwk = await exportJWK(publicKey);
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  jwk.kid = `oidc-mock-${randomUUID()}`;

  // Registered identities, keyed by lowercased email. Persistent across
  // sign-ins (unlike the old single-slot `nextProfile`) — safe under
  // fullyParallel workers.
  const identities = new Map<string, Required<PortalIdentity>>();
  // code → grant (single-use). access_token/refresh_token → identity.
  const codes = new Map<string, CodeGrant>();
  const accessTokens = new Map<string, Required<PortalIdentity>>();
  const refreshTokens = new Map<string, Required<PortalIdentity>>();

  async function readBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  function clientAuthOk(req: IncomingMessage, params: URLSearchParams): boolean {
    const basic = req.headers.authorization;
    if (basic?.startsWith('Basic ')) {
      const decoded = Buffer.from(basic.slice(6), 'base64').toString('utf8');
      const idx = decoded.indexOf(':');
      const id = decodeURIComponent(decoded.slice(0, idx));
      const secret = decodeURIComponent(decoded.slice(idx + 1));
      return id === options.clientId && secret === options.clientSecret;
    }
    return (
      params.get('client_id') === options.clientId &&
      params.get('client_secret') === options.clientSecret
    );
  }

  function identityClaims(identity: Required<PortalIdentity>): Record<string, unknown> {
    return {
      sub: identity.sub,
      email: identity.email,
      email_verified: true,
      name: identity.name,
      tier: identity.tier,
      capabilities: identity.capabilities,
    };
  }

  const server: Server = createServer(async (req, res) => {
    try {
      const host = req.headers.host ?? '127.0.0.1';
      const url = new URL(req.url ?? '/', `http://${host}`);
      const issuer = `http://${host}`;

      // Discovery
      if (
        req.method === 'GET' &&
        url.pathname === '/.well-known/openid-configuration'
      ) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            issuer,
            authorization_endpoint: `${issuer}/oauth/authorize`,
            token_endpoint: `${issuer}/oauth/token`,
            userinfo_endpoint: `${issuer}/userinfo`,
            jwks_uri: `${issuer}/.well-known/jwks.json`,
            response_types_supported: ['code'],
            grant_types_supported: ['authorization_code', 'refresh_token'],
            code_challenge_methods_supported: ['S256'],
            subject_types_supported: ['public'],
            id_token_signing_alg_values_supported: ['RS256'],
            scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
            claims_supported: [
              'sub',
              'email',
              'email_verified',
              'name',
              'tier',
              'capabilities',
            ],
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

      // Authorize (GET) → members-door page
      if (req.method === 'GET' && url.pathname === '/oauth/authorize') {
        const missing = ['redirect_uri', 'state', 'code_challenge'].filter(
          (k) => !url.searchParams.get(k),
        );
        if (url.searchParams.get('code_challenge_method') !== 'S256') {
          missing.push('code_challenge_method=S256');
        }
        if (missing.length > 0) {
          res.writeHead(400, { 'content-type': 'text/plain' });
          res.end(`portal mock requires PKCE S256; missing: ${missing.join(', ')}`);
          return;
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(membersDoorHtml(url.searchParams));
        return;
      }

      // Authorize (POST) → mint code, redirect back
      if (req.method === 'POST' && url.pathname === '/oauth/authorize') {
        const form = new URLSearchParams(await readBody(req));
        const email = (form.get('email') ?? '').trim().toLowerCase();
        const redirectUri = form.get('redirect_uri');
        const state = form.get('state');
        const codeChallenge = form.get('code_challenge');
        if (!redirectUri || !state || !codeChallenge) {
          res.writeHead(400, { 'content-type': 'text/plain' });
          res.end('missing redirect_uri / state / code_challenge');
          return;
        }
        const identity = identities.get(email);
        if (!identity) {
          res.writeHead(400, { 'content-type': 'text/plain' });
          res.end(
            `unknown identity '${email}' — register it via POST /_test/identity first`,
          );
          return;
        }
        const code = `code-${randomUUID()}`;
        codes.set(code, {
          identity,
          codeChallenge,
          nonce: form.get('nonce'),
          clientId: form.get('client_id') ?? options.clientId,
        });
        const location =
          `${redirectUri}` +
          (redirectUri.includes('?') ? '&' : '?') +
          `code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
        res.writeHead(302, { Location: location });
        res.end();
        return;
      }

      // Token endpoint
      if (req.method === 'POST' && url.pathname === '/oauth/token') {
        const params = new URLSearchParams(await readBody(req));
        if (!clientAuthOk(req, params)) {
          res.writeHead(401, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_client' }));
          return;
        }
        const grantType = params.get('grant_type') ?? 'authorization_code';

        // Portal-shaped refresh grant: access token ONLY. Re-read userinfo
        // (or prompt=none) when fresh tier matters.
        if (grantType === 'refresh_token') {
          const rt = params.get('refresh_token');
          const identity = rt ? refreshTokens.get(rt) : undefined;
          if (!identity) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'invalid_grant' }));
            return;
          }
          const accessToken = `at-${randomUUID()}`;
          accessTokens.set(accessToken, identity);
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              access_token: accessToken,
              token_type: 'Bearer',
              expires_in: 3600,
            }),
          );
          return;
        }

        const code = params.get('code');
        const grant = code ? codes.get(code) : undefined;
        if (!code || !grant) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_grant' }));
          return;
        }
        codes.delete(code); // single-use
        const verifier = params.get('code_verifier');
        if (!verifier || s256(verifier) !== grant.codeChallenge) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'invalid_grant',
              error_description: 'PKCE S256 verification failed',
            }),
          );
          return;
        }

        const accessToken = `at-${randomUUID()}`;
        const refreshToken = `rt-${randomUUID()}`;
        accessTokens.set(accessToken, grant.identity);
        refreshTokens.set(refreshToken, grant.identity);

        const claims: Record<string, unknown> = identityClaims(grant.identity);
        if (grant.nonce) claims.nonce = grant.nonce;
        const idToken = await new SignJWT(claims)
          .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
          .setIssuer(issuer)
          .setAudience(grant.clientId)
          .setIssuedAt()
          .setExpirationTime('1h')
          .sign(privateKey);

        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            access_token: accessToken,
            refresh_token: refreshToken,
            id_token: idToken,
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'openid profile email offline_access',
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
        const identity = accessTokens.get(authHeader.slice('Bearer '.length));
        if (!identity) {
          res.writeHead(401);
          res.end();
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(identityClaims(identity)));
        return;
      }

      // Test control endpoints
      if (req.method === 'POST' && url.pathname === '/_test/identity') {
        const raw = await readBody(req);
        let parsed: PortalIdentity;
        try {
          parsed = JSON.parse(raw) as PortalIdentity;
        } catch {
          res.writeHead(400, { 'content-type': 'text/plain' });
          res.end('invalid JSON');
          return;
        }
        if (!parsed.email || !parsed.name || typeof parsed.tier !== 'string') {
          res.writeHead(400, { 'content-type': 'text/plain' });
          res.end('identity requires email, name, tier');
          return;
        }
        const key = parsed.email.trim().toLowerCase();
        const existing = identities.get(key);
        identities.set(key, {
          email: parsed.email.trim(),
          name: parsed.name,
          tier: parsed.tier,
          capabilities: parsed.capabilities ?? existing?.capabilities ?? [],
          sub: parsed.sub ?? existing?.sub ?? `portal-${randomUUID()}`,
        });
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === 'POST' && url.pathname === '/_test/reset') {
        identities.clear();
        codes.clear();
        accessTokens.clear();
        refreshTokens.clear();
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

  // OS-assigned port + graceful close so it doesn't block process exit if
  // teardown misfires (PLAN-008 Trap 1: "mock-server lifecycle clean across runs").
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
