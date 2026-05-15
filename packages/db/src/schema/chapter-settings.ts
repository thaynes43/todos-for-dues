import { pgTable, text, jsonb, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

export const chapterSettings = pgTable('chapter_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ChapterSettingRow = typeof chapterSettings.$inferSelect;
export type ChapterSettingInsert = typeof chapterSettings.$inferInsert;
