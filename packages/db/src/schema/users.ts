import { pgTable, uuid, text, timestamp, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { ROLES, type Role } from './enums';

const ROLES_SQL_LIST = ROLES.map((r) => `'${r}'`).join(',');

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    displayName: text('display_name').notNull(),
    role: text('role').$type<Role>().notNull().default('Active'),
    passwordHash: text('password_hash'),
    oidcSubject: text('oidc_subject'),
    oidcProvider: text('oidc_provider'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'users_role_enum',
      sql`${table.role} = ANY (ARRAY[${sql.raw(ROLES_SQL_LIST)}])`,
    ),
    check(
      'users_account_kind',
      sql`(${table.passwordHash} IS NOT NULL OR ${table.oidcSubject} IS NOT NULL)`,
    ),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
