'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signIn, type LoginActionResult } from './actions';

const initialState: LoginActionResult | undefined = undefined;

export function LoginForm({ ssoEnabled }: { ssoEnabled: boolean }) {
  const [state, action, pending] = useActionState(signIn, initialState);

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
        <a
          href="/api/auth/sign-in/oauth2?providerId=google-workspace&callbackURL=/"
          className="block w-full rounded border px-4 py-2 text-center"
          data-testid="sso-button"
        >
          Sign in with Google
        </a>
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
