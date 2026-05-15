import { eq } from 'drizzle-orm';
import { db } from '@app/db';
import { users, type Role } from '@app/db/schema';

/**
 * Read the role + displayName for a user. Used as a fallback when Better Auth's
 * built-in `user.additionalFields.role` plumbing isn't available (e.g., during
 * server-rendered routes that need role-gated UI before the session-fetch
 * roundtrip completes). DESIGN-004 §4.3.
 */
export async function getSessionRole(
  userId: string,
): Promise<{ role: Role; displayName: string }> {
  const [row] = await db
    .select({ role: users.role, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId));
  if (!row) {
    throw new Error(
      `User ${userId} disappeared between signin and session-extension lookup`,
    );
  }
  return { role: row.role, displayName: row.displayName };
}
