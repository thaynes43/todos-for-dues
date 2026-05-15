import { pgTable, uuid, timestamp, primaryKey, index } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';
import { users } from './users';

export const jobEnrollments = pgTable(
  'job_enrollments',
  {
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    activeId: uuid('active_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedAttendeeAt: timestamp('confirmed_attendee_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.jobId, table.activeId] }),
    index('job_enrollments_active_idx').on(table.activeId),
  ],
);

export type JobEnrollmentRow = typeof jobEnrollments.$inferSelect;
export type JobEnrollmentInsert = typeof jobEnrollments.$inferInsert;
