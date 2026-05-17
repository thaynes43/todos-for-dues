'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { auth } from '@app/auth';
import { db } from '@app/db';
import { inviteTokens } from '@app/db/schema';

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

  // PRD-003 R-14 / PLAN-014 §7 Risk 1 strategy (a) — revoke-first.
  // Atomically consume the invite token via UPDATE ... RETURNING. This single
  // statement both verifies (revokedAt IS NULL) and marks the token spent, so
  // concurrent redemptions cannot both succeed (only one UPDATE finds the row
  // with revokedAt NULL). If signUpEmail subsequently fails (e.g., email
  // collision), the token is orphaned (revoked, no associated user) — minor
  // wart accepted per PLAN-014 §7 Risk 1.
  const revoked = await db
    .update(inviteTokens)
    .set({ revokedAt: sql`now()` })
    .where(
      and(eq(inviteTokens.token, input.token.trim()), isNull(inviteTokens.revokedAt)),
    )
    .returning({ preselectedRole: inviteTokens.preselectedRole });

  if (revoked.length === 0) {
    return {
      ok: false,
      error: 'Invite link is invalid or has been revoked.',
      field: 'token',
    };
  }
  const preselectedRole = revoked[0]!.preselectedRole;

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
