'use client';

import { useActionState } from 'react';
import { requestPasswordReset, type ResetActionResult } from './actions';

const initialState: ResetActionResult | undefined = undefined;

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(
    requestPasswordReset,
    initialState,
  );

  return (
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
      {state?.ok ? (
        <div
          role="status"
          className="rounded border border-green-500 bg-green-50 p-3 text-sm text-green-900"
        >
          If an account with that email exists, we&apos;ve sent a reset link.
        </div>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? 'Sending…' : 'Send reset link'}
      </button>
    </form>
  );
}
