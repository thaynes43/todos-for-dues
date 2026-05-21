import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';
import { users } from './users';
import { type JobState } from './enums';

// PRD-011 R-07 audit row: one per successful job-content edit.
// `diff` carries only the changed fields per PLAN-017 Q-PLN-04, shape:
//   { fieldName: { before: <prev>, after: <next> }, ... }
export const jobContentChanges = pgTable(
  'job_content_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    diff: jsonb('diff').$type<Record<string, { before: unknown; after: unknown }>>().notNull(),
    stateAtEdit: text('state_at_edit').$type<JobState>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_job_content_changes_job_id').on(table.jobId, table.createdAt.desc()),
  ],
);

export type JobContentChangeRow = typeof jobContentChanges.$inferSelect;
export type JobContentChangeInsert = typeof jobContentChanges.$inferInsert;
