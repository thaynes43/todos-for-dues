'use client';

import { useActionState } from 'react';
import { signupWithInviteToken, type SignupActionResult } from './actions';

const initialState: SignupActionResult | undefined = undefined;

export function SignupForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(
    signupWithInviteToken,
    initialState,
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
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
        <span className="block text-sm font-medium">Display name</span>
        <input
          name="displayName"
          type="text"
          required
          autoComplete="name"
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="block text-sm font-medium">Password</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
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
        {pending ? 'Creating…' : 'Create account'}
      </button>
    </form>
  );
}
