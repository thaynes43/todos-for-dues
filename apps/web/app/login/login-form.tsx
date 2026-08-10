'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { StatusNote } from '@/components/StatusNote';

// Mirrors PORTAL_PROVIDER_ID in @app/auth (server-only package — don't pull
// it into the client bundle). Changing it breaks the registered redirect URI.
const PORTAL_PROVIDER_ID = 'sigo-portal';

async function startSsoSignIn(): Promise<void> {
  // Better Auth's genericOAuth plugin exposes /sign-in/oauth2 as POST with JSON
  // body, returning { url } for the authorization redirect. A plain <a href>
  // would GET and 404. errorCallbackURL routes callback failures (e.g. a
  // pending membership) back here with ?error=….
  const res = await fetch('/api/auth/sign-in/oauth2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      providerId: PORTAL_PROVIDER_ID,
      callbackURL: '/',
      errorCallbackURL: '/login',
    }),
    credentials: 'same-origin',
  });
  if (!res.ok) {
    window.location.href = '/login?error=sso_unavailable';
    return;
  }
  const data = (await res.json()) as { url?: string };
  window.location.href = data.url ?? '/login?error=sso_unavailable';
}

export function LoginForm({ ssoEnabled }: { ssoEnabled: boolean }) {
  const [pending, setPending] = useState(false);

  if (!ssoEnabled) {
    // Fail closed (ADR-013): no portal client config → no sign-in path.
    return (
      <StatusNote tone="warning" testId="sso-disabled" className="text-left">
        Sign-in isn&apos;t set up on this instance — operator: set{' '}
        <code>OIDC_CLIENT_ID</code>, <code>OIDC_CLIENT_SECRET</code>, and{' '}
        <code>OIDC_DISCOVERY_URL</code>.
      </StatusNote>
    );
  }

  return (
    <Button
      type="button"
      size="lg"
      disabled={pending}
      onClick={() => {
        setPending(true);
        void startSsoSignIn().catch(() => {
          setPending(false);
          window.location.href = '/login?error=sso_unavailable';
        });
      }}
      data-testid="sso-button"
    >
      {pending ? 'Opening sigoalumni.org…' : 'Sign in with sigoalumni.org'}
    </Button>
  );
}
