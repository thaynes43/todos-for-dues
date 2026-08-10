import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  jsonb,
  check,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { JOB_STATES, type JobState } from './enums';
import { users } from './users';

const JOB_STATES_SQL_LIST = JOB_STATES.map((s) => `'${s}'`).join(',');

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postedBy: uuid('posted_by')
      .notNull()
      .references(() => users.id),
    description: text('description').notNull(),
    duesAmount: numeric('dues_amount', { precision: 10, scale: 2 }).notNull(),
    recommendedPeopleCount: integer('recommended_people_count').notNull(),
    state: text('state').$type<JobState>().notNull().default('awaiting_moderation'),
    workDate: timestamp('work_date', { withTimezone: true }),
    perActiveDuesCredit: jsonb('per_active_dues_credit'),
    rejectionReason: text('rejection_reason'),
    cancellationReason: text('cancellation_reason'),
    disputeReason: text('dispute_reason'),
    // PRD-010 R-01..R-07: poster contact / location / duration / optional notes.
    // Drizzle maps `numeric` to TS `string` by default; 0.45 added a `mode`
    // option, but we deliberately stay in string mode — money-ish values must
    // not round-trip through IEEE floats. The tRPC layer parses on read and
    // stringifies on write — same pattern as `duesAmount` above.
    posterContactKind: text('poster_contact_kind')
      .$type<'email' | 'phone'>()
      .notNull()
      .default('email'),
    posterContactValue: text('poster_contact_value').notNull().default('unknown'),
    location: text('location').notNull().default('unknown'),
    estimatedDurationHours: numeric('estimated_duration_hours', {
      precision: 4,
      scale: 2,
    })
      .notNull()
      .default('1.0'),
    additionalNotes: text('additional_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'jobs_state_enum',
      sql`${table.state} = ANY (ARRAY[${sql.raw(JOB_STATES_SQL_LIST)}])`,
    ),
    check('jobs_dues_positive', sql`${table.duesAmount} > 0`),
    check('jobs_count_positive', sql`${table.recommendedPeopleCount} >= 1`),
    check('jobs_description_non_empty', sql`length(trim(${table.description})) > 0`),
    check(
      'jobs_poster_contact_kind_enum',
      sql`${table.posterContactKind} IN ('email','phone')`,
    ),
    check(
      'jobs_estimated_duration_range',
      sql`${table.estimatedDurationHours} > 0 AND ${table.estimatedDurationHours} <= 24`,
    ),
    index('jobs_state_idx').on(table.state),
    index('jobs_posted_by_created_at_idx').on(table.postedBy, table.createdAt.desc()),
  ],
);

export type JobRow = typeof jobs.$inferSelect;
export type JobInsert = typeof jobs.$inferInsert;
