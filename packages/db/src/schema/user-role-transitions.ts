import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { type Role, type RoleInitiatorKind } from './enums';

export const userRoleTransitions = pgTable(
  'user_role_transitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fromRole: text('from_role').$type<Role>(),
    toRole: text('to_role').$type<Role>().notNull(),
    initiatorId: uuid('initiator_id').references(() => users.id),
    initiatorKind: text('initiator_kind').$type<RoleInitiatorKind>().notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('user_role_transitions_user_created_idx').on(table.userId, table.createdAt.desc()),
  ],
);

export type UserRoleTransitionRow = typeof userRoleTransitions.$inferSelect;
export type UserRoleTransitionInsert = typeof userRoleTransitions.$inferInsert;
