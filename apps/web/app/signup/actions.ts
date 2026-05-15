'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth, verifyInviteToken, InviteTokenError } from '@app/auth';

const SignupInput = z.object({
  token: z.string().min(1, 'Invite link is invalid or has been revoked.'),
  email: z.email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  displayName: z
    .string()
    .trim()
    .min(1, 'Display name is required.'),
});

export type SignupActionResult =
  | { ok: true }
  | { ok: false; error: string; field?: keyof typeof SignupInput.shape };

export async function signupWithInviteToken(
  _prevState: SignupActionResult | undefined,
  formData: FormData,
): Promise<SignupActionResult> {
  const raw = Object.fromEntries(formData);
  const parsed = SignupInput.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path[0];
    return {
      ok: false,
      error: first?.message ?? 'Invalid input.',
      ...(typeof path === 'string'
        ? { field: path as keyof typeof SignupInput.shape }
        : {}),
    };
  }
  const input = parsed.data;

  let preselectedRole: 'Active' | 'Alumni';
  try {
    const verified = await verifyInviteToken(input.token);
    preselectedRole = verified.preselectedRole;
  } catch (err) {
    if (err instanceof InviteTokenError) {
      return { ok: false, error: err.message, field: 'token' };
    }
    throw err;
  }

  try {
    await auth.api.signUpEmail({
      body: {
        email: input.email,
        password: input.password,
        name: input.displayName,
        role: preselectedRole,
      } as never,
    });
  } catch (err) {
    if (err instanceof Error && 'body' in err) {
      const body = (err as { body?: { message?: string } }).body;
      return {
        ok: false,
        error: body?.message ?? 'Could not create your account.',
      };
    }
    throw err;
  }

  redirect('/');
}
