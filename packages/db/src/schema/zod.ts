import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { users } from './users';
import { jobs } from './jobs';
import { jobEnrollments } from './job-enrollments';
import { jobStateTransitions } from './job-state-transitions';
import { userRoleTransitions } from './user-role-transitions';
import { chapterSettings } from './chapter-settings';

export const userInsertSchema = createInsertSchema(users);
export const userSelectSchema = createSelectSchema(users);

export const jobInsertSchema = createInsertSchema(jobs);
export const jobSelectSchema = createSelectSchema(jobs);

export const jobEnrollmentInsertSchema = createInsertSchema(jobEnrollments);
export const jobEnrollmentSelectSchema = createSelectSchema(jobEnrollments);

export const jobStateTransitionInsertSchema = createInsertSchema(jobStateTransitions);
export const jobStateTransitionSelectSchema = createSelectSchema(jobStateTransitions);

export const userRoleTransitionInsertSchema = createInsertSchema(userRoleTransitions);
export const userRoleTransitionSelectSchema = createSelectSchema(userRoleTransitions);

export const chapterSettingsInsertSchema = createInsertSchema(chapterSettings);
export const chapterSettingsSelectSchema = createSelectSchema(chapterSettings);
