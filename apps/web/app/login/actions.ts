'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@app/auth';

const LoginInput = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

export type LoginActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function signIn(
  _prevState: LoginActionResult | undefined,
  formData: FormData,
): Promise<LoginActionResult> {
  const parsed = LoginInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input.',
    };
  }

  try {
    await auth.api.signInEmail({ body: parsed.data });
  } catch (err) {
    if (err instanceof Error && 'body' in err) {
      const body = (err as { body?: { message?: string } }).body;
      return {
        ok: false,
        error: body?.message ?? 'Invalid email or password.',
      };
    }
    throw err;
  }

  redirect('/');
}
