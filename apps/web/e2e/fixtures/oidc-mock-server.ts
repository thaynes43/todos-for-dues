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
 *   GET  /api/member/status                 → member-status registry read (ADR-014)
 *   PUT  /api/member/status                 → member-status registry write
 *   POST /_test/identity                    → upsert an identity (keyed by email)
 *   POST /_test/member-status               → set a registry row / row absence / route mode
 *   GET  /_test/member-status?email=…       → inspect a registry row (spec assertions)
 *   POST /_test/reset                       → clear all in-memory state
 *
 * Member status (sigo-alumni backlog item 07): registering an identity
 * auto-creates a registry row with `status: null` (undeclared) — the portal
 * registry is the roster of record, so members-door identities have rows by
 * default. Specs opt into the contract's edge shapes per email via
 * `/_test/member-status`:
 *   - `{ status: 'active'|'alumni'|null }`  → declared / undeclared row
 *   - `{ hasRow: false }`                    → no linked row (409 JSON `{code:'no_registry_row'}`)
 *   - `{ mode: 'absent' }`                   → route-level 404 for THIS member's
 *     calls (feature-off / portal-not-shipped shape, parallel-worker-safe —
 *     a global toggle would leak into concurrently running specs)
 * The `status` claim in id_token + userinfo snapshots the registry row at
 * token-mint time (absent when the member has no row).
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
  /** Initial member-status registry value (ADR-014). Defaults to null
   * (row exists, undeclared). */
  status?: 'active' | 'alumni' | null;
}

/** Per-email member-status registry row (ADR-014 / backlog item 07). */
export interface MemberStatusRow {
  hasRow: boolean;
  status: 'active' | 'alumni' | null;
  /** 'absent' = this member's /api/member/status calls see a route-level 404. */
  mode: 'on' | 'absent';
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

/** Identity as stored in the mock's maps — `status` lives in the registry,
 * not on the identity (one store, per the contract). */
type RegisteredIdentity = Required<Omit<PortalIdentity, 'status'>>;

interface CodeGrant {
  identity: RegisteredIdentity;
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
  const identities = new Map<string, RegisteredIdentity>();
  // code → grant (single-use). access_token/refresh_token → identity.
  const codes = new Map<string, CodeGrant>();
  const accessTokens = new Map<string, RegisteredIdentity>();
  const refreshTokens = new Map<string, RegisteredIdentity>();
  // Member-status registry rows, keyed by lowercased email (ADR-014).
  const memberStatusRows = new Map<string, MemberStatusRow>();

  const emailKey = (email: string) => email.trim().toLowerCase();

  function memberStatusRow(email: string): MemberStatusRow {
    return (
      memberStatusRows.get(emailKey(email)) ?? {
        hasRow: false,
        status: null,
        mode: 'on',
      }
    );
  }

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

  function identityClaims(identity: RegisteredIdentity): Record<string, unknown> {
    const claims: Record<string, unknown> = {
      sub: identity.sub,
      email: identity.email,
      email_verified: true,
      name: identity.name,
      tier: identity.tier,
      capabilities: identity.capabilities,
    };
    // ADR-014 `status` claim — sign-in-time snapshot of the registry row.
    // Absent when the member has no linked row (pending-shaped members).
    const row = memberStatusRow(identity.email);
    if (row.hasRow) claims.status = row.status;
    return claims;
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

      // Member-status registry API (ADR-014 / sigo-alumni backlog item 07)
      if (url.pathname === '/api/member/status') {
        const authHeader = req.headers.authorization;
        const identity = authHeader?.startsWith('Bearer ')
          ? accessTokens.get(authHeader.slice('Bearer '.length))
          : undefined;
        if (!identity) {
          res.writeHead(401, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_token' }));
          return;
        }
        const key = emailKey(identity.email);
        const row = memberStatusRow(identity.email);
        if (row.mode === 'absent') {
          // Feature-off shape: what a portal WITHOUT the endpoint serves —
          // a route-level 404 (no JSON error body).
          res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
          res.end('<h1>404 — page not found</h1>');
          return;
        }
        if (!row.hasRow) {
          // Pinned contract: 409 JSON `{ code: 'no_registry_row' }` — route
          // exists, authenticated member has no linked registry row.
          res.writeHead(409, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ code: 'no_registry_row' }));
          return;
        }
        if (req.method === 'GET') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ status: row.status }));
          return;
        }
        if (req.method === 'PUT') {
          let parsed: { status?: unknown };
          try {
            parsed = JSON.parse(await readBody(req)) as { status?: unknown };
          } catch {
            parsed = {};
          }
          if (parsed.status !== 'active' && parsed.status !== 'alumni') {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'invalid_status' }));
            return;
          }
          memberStatusRows.set(key, { ...row, status: parsed.status });
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ status: parsed.status }));
          return;
        }
        res.writeHead(405);
        res.end();
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
        // Registry is the roster of record — a members-door identity has a
        // row by default (undeclared unless the registration says otherwise).
        const existingRow = memberStatusRows.get(key);
        memberStatusRows.set(key, {
          hasRow: existingRow?.hasRow ?? true,
          status:
            parsed.status !== undefined
              ? parsed.status
              : (existingRow?.status ?? null),
          mode: existingRow?.mode ?? 'on',
        });
        res.writeHead(204);
        res.end();
        return;
      }

      if (url.pathname === '/_test/member-status') {
        if (req.method === 'GET') {
          const email = url.searchParams.get('email');
          if (!email) {
            res.writeHead(400, { 'content-type': 'text/plain' });
            res.end('email query param required');
            return;
          }
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(memberStatusRow(email)));
          return;
        }
        if (req.method === 'POST') {
          let parsed: Partial<MemberStatusRow> & { email?: string };
          try {
            parsed = JSON.parse(await readBody(req)) as typeof parsed;
          } catch {
            res.writeHead(400, { 'content-type': 'text/plain' });
            res.end('invalid JSON');
            return;
          }
          if (!parsed.email) {
            res.writeHead(400, { 'content-type': 'text/plain' });
            res.end('email required');
            return;
          }
          const rowKey = emailKey(parsed.email);
          const row = memberStatusRow(parsed.email);
          memberStatusRows.set(rowKey, {
            hasRow: parsed.hasRow ?? row.hasRow,
            status: parsed.status !== undefined ? parsed.status : row.status,
            mode: parsed.mode ?? row.mode,
          });
          res.writeHead(204);
          res.end();
          return;
        }
      }

      if (req.method === 'POST' && url.pathname === '/_test/reset') {
        identities.clear();
        codes.clear();
        accessTokens.clear();
        refreshTokens.clear();
        memberStatusRows.clear();
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
