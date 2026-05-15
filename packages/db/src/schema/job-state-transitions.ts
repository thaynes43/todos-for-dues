import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { jobs } from './jobs';
import { users } from './users';
import { type ActorKind } from './enums';

export const jobStateTransitions = pgTable(
  'job_state_transitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    fromState: text('from_state'),
    toState: text('to_state').notNull(),
    actorId: uuid('actor_id').references(() => users.id),
    actorKind: text('actor_kind').$type<ActorKind>().notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('job_state_transitions_job_created_idx').on(table.jobId, table.createdAt),
    index('job_state_transitions_disputed_idx')
      .on(table.createdAt)
      .where(sql`${table.toState} = 'disputed'`),
  ],
);

export type JobStateTransitionRow = typeof jobStateTransitions.$inferSelect;
export type JobStateTransitionInsert = typeof jobStateTransitions.$inferInsert;
