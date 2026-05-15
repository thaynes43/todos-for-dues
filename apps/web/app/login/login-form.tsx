'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { signIn, type LoginActionResult } from './actions';

const initialState: LoginActionResult | undefined = undefined;

async function startSsoSignIn(): Promise<void> {
  // Better Auth's genericOAuth plugin exposes /sign-in/oauth2 as POST with JSON body,
  // returning { url } for the authorization redirect. A plain <a href> would GET and 404.
  const res = await fetch('/api/auth/sign-in/oauth2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId: 'google-workspace', callbackURL: '/' }),
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
  const [state, action, pending] = useActionState(signIn, initialState);
  const [ssoPending, setSsoPending] = useState(false);

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-4">
        <label className="block">
          <span className="block text-sm font-medium">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium">Password</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        {state && !state.ok ? (
          <div
            role="alert"
            className="rounded border border-red-500 bg-red-50 p-3 text-sm text-red-900"
          >
            {state.error}
          </div>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      {ssoEnabled ? (
        <button
          type="button"
          disabled={ssoPending}
          onClick={() => {
            setSsoPending(true);
            void startSsoSignIn().catch(() => {
              setSsoPending(false);
              window.location.href = '/login?error=sso_unavailable';
            });
          }}
          className="block w-full rounded border px-4 py-2 text-center disabled:opacity-50"
          data-testid="sso-button"
        >
          {ssoPending ? 'Redirecting…' : 'Sign in with Google'}
        </button>
      ) : null}
      <p className="text-sm">
        Have an invite link?{' '}
        <Link href="/forgot-password" className="underline">
          Forgot password?
        </Link>
      </p>
    </div>
  );
}
