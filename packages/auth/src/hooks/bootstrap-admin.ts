import { eq } from 'drizzle-orm';
import { db } from '@app/db';
import { users } from '@app/db/schema';
import { transitionRole } from '@app/domain';

/**
 * Promote the user named by `BOOTSTRAP_ADMIN_EMAIL` to Admin on every signin
 * (idempotent — no-op if already Admin). Routes through `transitionRole` to
 * preserve PLAN-003's single-writer invariant on `users.role` and
 * `user_role_transitions`. Initiator is system (initiatorKind: 'system',
 * initiatorId: null).
 */
export async function bootstrapAdminOnSignin(user: {
  id: string;
  email: string;
}): Promise<void> {
  const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  if (!bootstrapEmail) return;
  if (user.email.toLowerCase() !== bootstrapEmail.toLowerCase()) return;

  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, user.id));
  if (!row || row.role === 'Admin') return;

  await transitionRole({
    targetUserId: user.id,
    expectedFromRole: row.role,
    toRole: 'Admin',
    initiator: { id: null, kind: 'system' },
    note: 'BOOTSTRAP_ADMIN_EMAIL promotion',
  });
}
