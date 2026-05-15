import { pgTable, uuid, text, timestamp, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { INVITE_TOKEN_ROLES, type InviteTokenRole } from './enums';
import { users } from './users';

const INVITE_TOKEN_ROLES_SQL_LIST = INVITE_TOKEN_ROLES.map((r) => `'${r}'`).join(',');

export const inviteTokens = pgTable(
  'invite_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    token: text('token').notNull().unique(),
    preselectedRole: text('preselected_role').$type<InviteTokenRole>().notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'invite_tokens_role_non_privileged',
      sql`${table.preselectedRole} = ANY (ARRAY[${sql.raw(INVITE_TOKEN_ROLES_SQL_LIST)}])`,
    ),
  ],
);

export type InviteTokenRow = typeof inviteTokens.$inferSelect;
export type InviteTokenInsert = typeof inviteTokens.$inferInsert;
