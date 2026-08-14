import { createServer, type IncomingMessage, type Server } from 'node:http';

/**
 * Minimal portal-API mock for the memberStatus router integration tests
 * (ADR-014). Serves just enough of the portal surface for the REAL
 * `auth.api.getAccessToken` + portal-client path to run:
 *
 *   GET  /.well-known/openid-configuration  → issuer + token_endpoint
 *   POST /oauth/token (refresh grant)       → fresh access token
 *   GET  /api/member/status                 → registry read (bearer-keyed)
 *   PUT  /api/member/status                 → registry write
 *
 * The full browser-facing OIDC mock lives in
 * `apps/web/e2e/fixtures/oidc-mock-server.ts`; this one skips authorize /
 * JWKS / id_tokens entirely — tests seed `account` rows directly.
 */

export type MockMemberStatus = 'active' | 'alumni' | null;

export interface PortalApiMock {
  baseUrl: string;
  discoveryUrl: string;
  /** access token → registry key. */
  tokens: Map<string, string>;
  /** refresh token → registry key (refresh mints a new access token). */
  refreshTokens: Map<string, string>;
  /** registry key → status row. Absent key = no linked registry row (404 JSON). */
  registry: Map<string, MockMemberStatus>;
  /** 'on' = normal; 'absent' = route-level 404 (portal pre-launch); 'not-implemented' = 501. */
  mode: 'on' | 'absent' | 'not-implemented';
  refreshCount: number;
  stop: () => Promise<void>;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function startPortalApiMock(): Promise<PortalApiMock> {
  // Mutable shared state — the returned object IS this object (plus the
  // server handles reading it live), so tests can flip `mode` mid-run.
  const state = {
    tokens: new Map<string, string>(),
    refreshTokens: new Map<string, string>(),
    registry: new Map<string, MockMemberStatus>(),
    mode: 'on' as PortalApiMock['mode'],
    refreshCount: 0,
  };

  const server: Server = createServer(async (req, res) => {
    const host = req.headers.host ?? '127.0.0.1';
    const url = new URL(req.url ?? '/', `http://${host}`);
    const issuer = `http://${host}`;

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
        }),
      );
      return;
    }

    // Refresh grant only — these tests never run the authorize flow.
    if (req.method === 'POST' && url.pathname === '/oauth/token') {
      const params = new URLSearchParams(await readBody(req));
      const rt = params.get('refresh_token');
      const key = rt ? state.refreshTokens.get(rt) : undefined;
      if (params.get('grant_type') !== 'refresh_token' || !key) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_grant' }));
        return;
      }
      state.refreshCount += 1;
      const accessToken = `at-refreshed-${state.refreshCount}-${key}`;
      state.tokens.set(accessToken, key);
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

    if (url.pathname === '/api/member/status') {
      if (state.mode === 'absent') {
        // Route-level 404 — what a portal WITHOUT the endpoint returns.
        res.writeHead(404, { 'content-type': 'text/html' });
        res.end('<h1>404 — page not found</h1>');
        return;
      }
      if (state.mode === 'not-implemented') {
        res.writeHead(501, { 'content-type': 'text/plain' });
        res.end('Not Implemented');
        return;
      }
      const authHeader = req.headers.authorization;
      const key = authHeader?.startsWith('Bearer ')
        ? state.tokens.get(authHeader.slice('Bearer '.length))
        : undefined;
      if (!key) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_token' }));
        return;
      }
      if (!state.registry.has(key)) {
        // Application 404 — route exists, no linked registry row.
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'no_registry_row' }));
        return;
      }
      if (req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: state.registry.get(key) ?? null }));
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
        state.registry.set(key, parsed.status);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: parsed.status }));
        return;
      }
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not Found');
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('portal API mock failed to bind a port');
  }
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return Object.assign(state, {
    baseUrl,
    discoveryUrl: `${baseUrl}/.well-known/openid-configuration`,
    async stop() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  });
}
