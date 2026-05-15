'use server';

import { z } from 'zod';
import { auth } from '@app/auth';

const ResetInput = z.object({
  email: z.email('Enter a valid email address.'),
});

export type ResetActionResult = { ok: boolean };

export async function requestPasswordReset(
  _prevState: ResetActionResult | undefined,
  formData: FormData,
): Promise<ResetActionResult> {
  const parsed = ResetInput.safeParse(Object.fromEntries(formData));
  // Always succeed-shape to prevent email enumeration (PRD-003 + DESIGN-004 §4.8).
  if (!parsed.success) {
    return { ok: true };
  }
  try {
    await auth.api.requestPasswordReset({
      body: { email: parsed.data.email, redirectTo: '/reset-password' },
    });
  } catch {
    // Swallow — same response shape regardless of outcome.
  }
  return { ok: true };
}
