import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import {
  jobs,
  jobEnrollments,
  jobStateTransitions,
  users,
  JOB_STATES,
  type JobState,
} from '@app/db/schema';
import {
  approveJob,
  createJob,
  editJob,
  recordRelationshipEvent,
  transitionJob,
  ConcurrentTransitionError,
} from '@app/domain';
import {
  sendActiveJobEditedEmails,
  sendAdminDisputeEmail,
  sendModeratorQueueEmail,
  sendTreasurerEmail,
} from '@app/notifications';
import { authedProcedure, mapDomainErrors, router } from '../trpc';
import {
  activeProcedure,
  adminProcedure,
  alumniProcedure,
  moderatorProcedure,
} from '../middleware/role';
import { jobPosterProcedure } from '../middleware/job';
import { computeDuesSplit } from '../dues';
import { chapterBus } from '../events';
import type { ChapterEventKind } from '../events';

// PRD-012 / ADR-012 / PLAN-018 — publish a chapter SSE event AFTER the txn
// commits (Q-PLN-04). Failures are logged + swallowed: the DB is consistent
// and a missed event recovers via the client's reconnect + Last-Event-ID
// replay + the existing pull-on-page-load behavior.
function publishJobEvent(
  jobId: string,
  eventKind: ChapterEventKind,
  actorId: string,
): void {
  try {
    chapterBus.publish({ jobId, eventKind, actorId });
  } catch (err) {
    console.error(
      `chapterBus.publish failed (${eventKind} on ${jobId}):`,
      err,
    );
  }
}

const jobIdInput = z.object({ jobId: z.string().uuid() });

export const jobsRouter = router({
  // ─── Mutations ─────────────────────────────────────────────────────

  // CMD-01 PostJob — PRD-002 R-01..R-05 + R-12, extended by PRD-010 R-01..R-07.
  post: alumniProcedure
    .input(
      z.object({
        description: z.string().trim().min(1),
        duesAmount: z.number().positive(),
        recommendedPeopleCount: z.number().int().min(1),
        // PRD-010 R-01 / R-02 — contact (email OR phone), location, duration,
        // optional notes. All validated server-side; the migration DEFAULTs are
        // a one-time backfill safety net only.
        posterContactKind: z.enum(['email', 'phone']),
        posterContactValue: z.string().trim().min(1).max(200),
        location: z.string().trim().min(1).max(200),
        estimatedDurationHours: z.number().positive().max(24),
        additionalNotes: z
          .string()
          .max(500)
          .transform((v) => (v.trim().length === 0 ? null : v))
          .nullable()
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return mapDomainErrors(async () => {
        const { jobId } = await createJob({
          posterId: ctx.userId,
          description: input.description,
          duesAmount: input.duesAmount,
          recommendedPeopleCount: input.recommendedPeopleCount,
          posterContactKind: input.posterContactKind,
          posterContactValue: input.posterContactValue,
          location: input.location,
          estimatedDurationHours: input.estimatedDurationHours,
          additionalNotes: input.additionalNotes ?? null,
          afterCommit: async (id) => {
            await sendModeratorQueueEmail({ jobId: id });
          },
        });
        publishJobEvent(jobId, 'job.posted', ctx.userId);
        return { jobId };
      });
    }),

  // CMD-02 ApproveJob — PRD-002 R-07 (self-approval permitted per Q-03)
  approve: moderatorProcedure
    .input(jobIdInput)
    .mutation(async ({ ctx, input }) => {
      return mapDomainErrors(async () => {
        await approveJob({ jobId: input.jobId, moderatorId: ctx.userId });
        publishJobEvent(input.jobId, 'job.approved', ctx.userId);
      });
    }),

  // CMD-03 RejectJob — PRD-002 R-08
  reject: moderatorProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        reason: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return mapDomainErrors(async () => {
        await transitionJob({
          jobId: input.jobId,
          expectedFromState: 'awaiting_moderation',
          event: 'reject',
          actor: { id: ctx.userId, kind: 'user' },
          note: input.reason,
          beforeStateWrite: async (tx) => {
            await tx
              .update(jobs)
              .set({ rejectionReason: input.reason })
              .where(eq(jobs.id, input.jobId));
          },
        });
        publishJobEvent(input.jobId, 'job.rejected', ctx.userId);
      });
    }),

  // CMD-04 EnrollInJob — PRD-004 R-02 / AC-03 (idempotent)
  enroll: activeProcedure
    .input(jobIdInput)
    .mutation(async ({ ctx, input }) => {
      return mapDomainErrors(async () => {
        const [job] = await ctx.db
          .select({ state: jobs.state })
          .from(jobs)
          .where(eq(jobs.id, input.jobId));
        if (!job) throw new TRPCError({ code: 'NOT_FOUND' });
        if (job.state !== 'enrollment_open') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Job is not accepting enrollments.',
          });
        }

        const existing = await ctx.db
          .select({ jobId: jobEnrollments.jobId })
          .from(jobEnrollments)
          .where(
            and(
              eq(jobEnrollments.jobId, input.jobId),
              eq(jobEnrollments.activeId, ctx.userId),
            ),
          );
        if (existing.length > 0) return;

        await recordRelationshipEvent({
          jobId: input.jobId,
          currentState: 'enrollment_open',
          event: 'enroll',
          actor: { id: ctx.userId, kind: 'user' },
          beforeAuditWrite: async (tx) => {
            await tx
              .insert(jobEnrollments)
              .values({ jobId: input.jobId, activeId: ctx.userId })
              .onConflictDoNothing();
          },
        });
        publishJobEvent(input.jobId, 'job.enrolled', ctx.userId);
      });
    }),

  // CMD-05 UnenrollFromJob — PRD-004 R-03/R-04
  unenroll: activeProcedure
    .input(jobIdInput)
    .mutation(async ({ ctx, input }) => {
      return mapDomainErrors(async () => {
        const [job] = await ctx.db
          .select({ state: jobs.state })
          .from(jobs)
          .where(eq(jobs.id, input.jobId));
        if (!job) throw new TRPCError({ code: 'NOT_FOUND' });
        if (job.state !== 'enrollment_open') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot unenroll once the job is locked.',
          });
        }

        const existing = await ctx.db
          .select({ jobId: jobEnrollments.jobId })
          .from(jobEnrollments)
          .where(
            and(
              eq(jobEnrollments.jobId, input.jobId),
              eq(jobEnrollments.activeId, ctx.userId),
            ),
          );
        if (existing.length === 0) return;

        await recordRelationshipEvent({
          jobId: input.jobId,
          currentState: 'enrollment_open',
          event: 'unenroll',
          actor: { id: ctx.userId, kind: 'user' },
          beforeAuditWrite: async (tx) => {
            await tx
              .delete(jobEnrollments)
              .where(
                and(
                  eq(jobEnrollments.jobId, input.jobId),
                  eq(jobEnrollments.activeId, ctx.userId),
                ),
              );
          },
        });
        publishJobEvent(input.jobId, 'job.unenrolled', ctx.userId);
      });
    }),

  // CMD-06 LockJob — PRD-004 R-07/R-08/R-09
  lock: jobPosterProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        workDate: z.string().datetime(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return mapDomainErrors(async () => {
        const workDate = new Date(input.workDate);
        if (workDate <= new Date()) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Work date must be in the future.',
          });
        }

        const [{ count = 0 } = { count: 0 }] = await ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(jobEnrollments)
          .where(eq(jobEnrollments.jobId, input.jobId));
        if (count === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'At least one Active must be enrolled to lock.',
          });
        }

        await transitionJob({
          jobId: input.jobId,
          expectedFromState: 'enrollment_open',
          event: 'lock',
          actor: { id: ctx.userId, kind: 'user' },
          note: workDate.toISOString(),
          beforeStateWrite: async (tx) => {
            await tx
              .update(jobs)
              .set({ workDate })
              .where(eq(jobs.id, input.jobId));
          },
        });
        publishJobEvent(input.jobId, 'job.locked', ctx.userId);
      });
    }),

  // CMD-07 RescheduleJob — PRD-004 R-10
  reschedule: jobPosterProcedure
    .input(jobIdInput)
    .mutation(async ({ ctx, input }) => {
      return mapDomainErrors(async () => {
        const [job] = await ctx.db
          .select({ workDate: jobs.workDate })
          .from(jobs)
          .where(eq(jobs.id, input.jobId));
        await transitionJob({
          jobId: input.jobId,
          expectedFromState: 'locked',
          event: 'reschedule',
          actor: { id: ctx.userId, kind: 'user' },
          note: job?.workDate?.toISOString() ?? undefined,
          beforeStateWrite: async (tx) => {
            await tx
              .update(jobs)
              .set({ workDate: null })
              .where(eq(jobs.id, input.jobId));
          },
        });
        publishJobEvent(input.jobId, 'job.rescheduled', ctx.userId);
      });
    }),

  // CMD-08 CancelJob — PRD-004 R-11/R-12
  cancel: jobPosterProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        reason: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return mapDomainErrors(async () => {
        const [job] = await ctx.db
          .select({ state: jobs.state })
          .from(jobs)
          .where(eq(jobs.id, input.jobId));
        if (!job) throw new TRPCError({ code: 'NOT_FOUND' });
        if (job.state !== 'enrollment_open' && job.state !== 'locked') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Job is not cancellable in its current state.',
          });
        }
        await transitionJob({
          jobId: input.jobId,
          expectedFromState: job.state,
          event: 'cancel',
          actor: { id: ctx.userId, kind: 'user' },
          note: input.reason,
          beforeStateWrite: async (tx) => {
            await tx
              .update(jobs)
              .set({ cancellationReason: input.reason })
              .where(eq(jobs.id, input.jobId));
          },
        });
        publishJobEvent(input.jobId, 'job.cancelled', ctx.userId);
      });
    }),

  // CMD-15 EditJob — PRD-011 R-01..R-10. Poster-only; allowed in
  // awaiting_moderation / approved / enrollment_open (jobPosterProcedure +
  // domain editJob enforces R-04). Whitelist input shape (R-03). Material
  // edits in approved|enrollment_open demote to awaiting_moderation (R-05).
  edit: jobPosterProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        edits: z
          .object({
            description: z.string().trim().min(1).optional(),
            duesAmount: z.number().positive().optional(),
            recommendedPeopleCount: z.number().int().min(1).optional(),
            posterContactKind: z.enum(['email', 'phone']).optional(),
            posterContactValue: z.string().trim().min(1).max(200).optional(),
            location: z.string().trim().min(1).max(200).optional(),
            estimatedDurationHours: z.number().positive().max(24).optional(),
            additionalNotes: z
              .string()
              .max(500)
              .transform((v) => (v.trim().length === 0 ? null : v))
              .nullable()
              .optional(),
          })
          .strict(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return mapDomainErrors(async () => {
        const result = await editJob({
          jobId: input.jobId,
          actorId: ctx.userId,
          edits: input.edits,
        });
        publishJobEvent(input.jobId, 'job.edited', ctx.userId);

        // Post-commit fan-out (PRD-011 R-08, R-10). Failures here are logged
        // but do not roll back — the edit committed; emails are best-effort.
        if (result.material && result.stateBeforeEdit !== 'awaiting_moderation') {
          try {
            await sendModeratorQueueEmail({
              jobId: input.jobId,
              subjectPrefix: '[Re-review]',
              idempotencyKeySuffix: `re_review:${Date.now()}`,
            });
          } catch (err) {
            console.error(
              `jobs.edit: sendModeratorQueueEmail failed for job ${input.jobId}:`,
              err,
            );
          }
          try {
            await sendActiveJobEditedEmails({
              jobId: input.jobId,
              diff: result.diff,
              newJobState: result.state,
              editId: `${Date.now()}`,
            });
          } catch (err) {
            console.error(
              `jobs.edit: sendActiveJobEditedEmails failed for job ${input.jobId}:`,
              err,
            );
          }
        }

        return {
          jobId: input.jobId,
          state: result.state,
          material: result.material,
          diff: result.diff,
        };
      });
    }),

  // CMD-09 CompleteJob — PRD-005 R-01..R-04
  complete: jobPosterProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        confirmedAttendees: z.array(z.string().uuid()).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return mapDomainErrors(async () => {
        const enrolled = await ctx.db
          .select({ activeId: jobEnrollments.activeId })
          .from(jobEnrollments)
          .where(eq(jobEnrollments.jobId, input.jobId));
        const enrolledSet = new Set(enrolled.map((e) => e.activeId));
        const invalid = input.confirmedAttendees.filter((a) => !enrolledSet.has(a));
        if (invalid.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Confirmed attendees not enrolled: ${invalid.join(', ')}`,
          });
        }

        const [job] = await ctx.db
          .select({ duesAmount: jobs.duesAmount })
          .from(jobs)
          .where(eq(jobs.id, input.jobId));
        if (!job) throw new TRPCError({ code: 'NOT_FOUND' });
        const credit = await computeDuesSplit(
          parseFloat(job.duesAmount),
          input.confirmedAttendees,
          ctx,
        );

        await transitionJob({
          jobId: input.jobId,
          expectedFromState: 'locked',
          event: 'complete',
          actor: { id: ctx.userId, kind: 'user' },
          note: `${input.confirmedAttendees.length} attendees confirmed`,
          beforeStateWrite: async (tx) => {
            for (const activeId of input.confirmedAttendees) {
              await tx
                .update(jobEnrollments)
                .set({ confirmedAttendeeAt: sql`now()` })
                .where(
                  and(
                    eq(jobEnrollments.jobId, input.jobId),
                    eq(jobEnrollments.activeId, activeId),
                  ),
                );
            }
          },
          afterStateWrite: async (tx) => {
            await tx
              .update(jobs)
              .set({ perActiveDuesCredit: credit })
              .where(eq(jobs.id, input.jobId));
          },
        });
        publishJobEvent(input.jobId, 'job.completed', ctx.userId);
      });
    }),

  // CMD-10 RevertCompletion — PRD-005 R-05
  revertCompletion: jobPosterProcedure
    .input(jobIdInput)
    .mutation(async ({ ctx, input }) => {
      return mapDomainErrors(async () => {
        await transitionJob({
          jobId: input.jobId,
          expectedFromState: 'completed',
          event: 'revert',
          actor: { id: ctx.userId, kind: 'user' },
          beforeStateWrite: async (tx) => {
            await tx
              .update(jobEnrollments)
              .set({ confirmedAttendeeAt: null })
              .where(eq(jobEnrollments.jobId, input.jobId));
            await tx
              .update(jobs)
              .set({ perActiveDuesCredit: null })
              .where(eq(jobs.id, input.jobId));
          },
        });
        publishJobEvent(input.jobId, 'job.revert_completion', ctx.userId);
      });
    }),

  // CMD-11 MarkPaymentSent — PRD-005 R-06/R-07
  markPaymentSent: jobPosterProcedure
    .input(jobIdInput)
    .mutation(async ({ ctx, input }) => {
      return mapDomainErrors(async () => {
        await transitionJob({
          jobId: input.jobId,
          expectedFromState: 'completed',
          event: 'payment_sent',
          actor: { id: ctx.userId, kind: 'user' },
          afterCommit: async () => {
            await sendTreasurerEmail({ jobId: input.jobId });
          },
        });
        publishJobEvent(input.jobId, 'job.payment_sent', ctx.userId);
      });
    }),

  /**
   * CMD-12 ConfirmReceipt — PRD-006 R-01..R-04.
   *
   * NON-STANDARD: when two callers race, exactly one transition succeeds. The
   * loser's `ConcurrentTransitionError` is swallowed and the procedure returns
   * `{ state: 'closed', alreadyClosed: true, closedBy: <first actor> }` with
   * HTTP 200. PRD-006 AC-04 demands this idempotent shape rather than 409.
   */
  confirmReceipt: authedProcedure
    .input(jobIdInput)
    .use(async ({ ctx, getRawInput, next }) => {
      const raw = (await getRawInput()) as { jobId?: string } | undefined;
      const jobId = raw?.jobId;
      if (!jobId) throw new TRPCError({ code: 'BAD_REQUEST' });
      if (ctx.userRole === 'Admin') return next();
      if (ctx.userRole === 'Active') {
        const [row] = await ctx.db
          .select({ jobId: jobEnrollments.jobId })
          .from(jobEnrollments)
          .where(
            and(
              eq(jobEnrollments.jobId, jobId),
              eq(jobEnrollments.activeId, ctx.userId!),
            ),
          );
        if (row) return next();
      }
      throw new TRPCError({ code: 'FORBIDDEN' });
    })
    .mutation(async ({ ctx, input }) => {
      try {
        await transitionJob({
          jobId: input.jobId,
          expectedFromState: 'payment_sent',
          event: 'confirm_receipt',
          actor: { id: ctx.userId, kind: 'user' },
        });
        publishJobEvent(input.jobId, 'job.confirmed_received', ctx.userId!);
        return { state: 'closed' as const, closedBy: ctx.userId, alreadyClosed: false };
      } catch (err) {
        if (err instanceof ConcurrentTransitionError) {
          const [closingRow] = await ctx.db
            .select({ actorId: jobStateTransitions.actorId })
            .from(jobStateTransitions)
            .where(
              and(
                eq(jobStateTransitions.jobId, input.jobId),
                eq(jobStateTransitions.toState, 'closed'),
              ),
            )
            .orderBy(desc(jobStateTransitions.createdAt))
            .limit(1);
          if (closingRow) {
            return {
              state: 'closed' as const,
              closedBy: closingRow.actorId,
              alreadyClosed: true,
            };
          }
        }
        return mapDomainErrors(async () => {
          throw err;
        });
      }
    }),

  // CMD-13 DisputeJob — PRD-006 R-05/R-06/R-07
  dispute: authedProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        reason: z.string().trim().min(1),
      }),
    )
    .use(async ({ ctx, getRawInput, next }) => {
      const raw = (await getRawInput()) as { jobId?: string } | undefined;
      const jobId = raw?.jobId;
      if (!jobId) throw new TRPCError({ code: 'BAD_REQUEST' });
      if (ctx.userRole === 'Admin') return next();
      if (ctx.userRole === 'Active') {
        const [row] = await ctx.db
          .select({ jobId: jobEnrollments.jobId })
          .from(jobEnrollments)
          .where(
            and(
              eq(jobEnrollments.jobId, jobId),
              eq(jobEnrollments.activeId, ctx.userId!),
            ),
          );
        if (row) return next();
      }
      throw new TRPCError({ code: 'FORBIDDEN' });
    })
    .mutation(async ({ ctx, input }) => {
      return mapDomainErrors(async () => {
        await transitionJob({
          jobId: input.jobId,
          expectedFromState: 'payment_sent',
          event: 'dispute',
          actor: { id: ctx.userId, kind: 'user' },
          note: input.reason,
          beforeStateWrite: async (tx) => {
            await tx
              .update(jobs)
              .set({ disputeReason: input.reason })
              .where(eq(jobs.id, input.jobId));
          },
          afterCommit: async () => {
            await sendAdminDisputeEmail({
              jobId: input.jobId,
              disputerId: ctx.userId!,
              reason: input.reason,
            });
          },
        });
        publishJobEvent(input.jobId, 'job.disputed', ctx.userId!);
      });
    }),

  // CMD-14a ResolveDisputeAsClosed — PRD-006 R-08
  resolveDisputeAsClosed: adminProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        note: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return mapDomainErrors(async () => {
        await transitionJob({
          jobId: input.jobId,
          expectedFromState: 'disputed',
          event: 'resolve_closed',
          actor: { id: ctx.userId, kind: 'user' },
          note: input.note,
          beforeStateWrite: async (tx) => {
            await tx
              .update(jobs)
              .set({ disputeReason: null })
              .where(eq(jobs.id, input.jobId));
          },
        });
        publishJobEvent(input.jobId, 'job.dispute_resolved', ctx.userId);
      });
    }),

  // CMD-14b ResolveDisputeAsCancelled — PRD-006 R-09
  resolveDisputeAsCancelled: adminProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        note: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return mapDomainErrors(async () => {
        await transitionJob({
          jobId: input.jobId,
          expectedFromState: 'disputed',
          event: 'resolve_cancelled',
          actor: { id: ctx.userId, kind: 'user' },
          note: input.note,
          beforeStateWrite: async (tx) => {
            await tx
              .update(jobs)
              .set({ disputeReason: null, cancellationReason: input.note })
              .where(eq(jobs.id, input.jobId));
          },
        });
        publishJobEvent(input.jobId, 'job.dispute_resolved', ctx.userId);
      });
    }),

  // CMD-14c ResolveDisputeAsPaymentSent — PRD-006 R-10
  resolveDisputeAsPaymentSent: adminProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        note: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return mapDomainErrors(async () => {
        await transitionJob({
          jobId: input.jobId,
          expectedFromState: 'disputed',
          event: 'resolve_payment_sent',
          actor: { id: ctx.userId, kind: 'user' },
          note: input.note,
          beforeStateWrite: async (tx) => {
            await tx
              .update(jobs)
              .set({ disputeReason: null })
              .where(eq(jobs.id, input.jobId));
          },
        });
        publishJobEvent(input.jobId, 'job.dispute_resolved', ctx.userId);
      });
    }),

  // ─── Queries ───────────────────────────────────────────────────────

  // Q-01 ListJobsByState — role-filtered
  listByState: authedProcedure
    .input(
      z.object({
        state: z.enum(JOB_STATES),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      // S-M3 (AUDIT-2026-08) gating:
      //   Admin / Moderator — any state (the /jobs state-filter UI is
      //     privileged-only), full chapter visibility.
      //   Active — enrollment_open only.
      //   Alumni — enrollment_open freely; every other state restricted to
      //     their own postings (no chapter-wide credit maps / reasons).
      const role = ctx.userRole;
      if (role === 'Active' && input.state !== 'enrollment_open') {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      let whereExpr;
      if (role === 'Alumni' && input.state !== 'enrollment_open') {
        whereExpr = and(
          eq(jobs.state, input.state),
          eq(jobs.postedBy, ctx.userId),
        );
      } else {
        whereExpr = eq(jobs.state, input.state);
      }

      // Narrow projection: exactly what the JobCard list rendering consumes.
      return ctx.db
        .select({
          id: jobs.id,
          description: jobs.description,
          duesAmount: jobs.duesAmount,
          recommendedPeopleCount: jobs.recommendedPeopleCount,
          state: jobs.state,
          createdAt: jobs.createdAt,
        })
        .from(jobs)
        .where(whereExpr)
        .orderBy(desc(jobs.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  // Q-02 GetJobById — role-aware roster projection per PRD-004 R-05.
  // PRD-010 R-03/R-06: enriched fields + poster displayName projected for the
  // detail view. The poster's *account* email is never selected here — only
  // the contact value the poster supplied on the form is exposed.
  getById: authedProcedure
    .input(jobIdInput)
    .query(async ({ ctx, input }) => {
      const [job] = await ctx.db
        .select()
        .from(jobs)
        .where(eq(jobs.id, input.jobId));
      if (!job) throw new TRPCError({ code: 'NOT_FOUND' });

      const [poster] = await ctx.db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, job.postedBy));

      const role = ctx.userRole;
      const isPoster = job.postedBy === ctx.userId;
      const isPrivileged = role === 'Moderator' || role === 'Admin';

      let viewerEnrolled = false;
      if (role === 'Active') {
        const [row] = await ctx.db
          .select({ jobId: jobEnrollments.jobId })
          .from(jobEnrollments)
          .where(
            and(
              eq(jobEnrollments.jobId, input.jobId),
              eq(jobEnrollments.activeId, ctx.userId),
            ),
          );
        viewerEnrolled = Boolean(row);
      }

      const seesRoster = isPoster || isPrivileged || viewerEnrolled;

      const enrollmentRows = await ctx.db
        .select({
          activeId: jobEnrollments.activeId,
          enrolledAt: jobEnrollments.enrolledAt,
          confirmedAttendeeAt: jobEnrollments.confirmedAttendeeAt,
        })
        .from(jobEnrollments)
        .where(eq(jobEnrollments.jobId, input.jobId));

      const enrolleeCount = enrollmentRows.length;
      const roster = seesRoster ? enrollmentRows : null;

      let closedBy: { displayName: string | null } | null = null;
      if (job.state === 'closed') {
        const [closeRow] = await ctx.db
          .select({ displayName: users.displayName })
          .from(jobStateTransitions)
          .leftJoin(users, eq(users.id, jobStateTransitions.actorId))
          .where(
            and(
              eq(jobStateTransitions.jobId, input.jobId),
              eq(jobStateTransitions.toState, 'closed'),
            ),
          )
          .orderBy(desc(jobStateTransitions.createdAt))
          .limit(1);
        closedBy = { displayName: closeRow?.displayName ?? null };
      }

      let viewerCredit:
        | { confirmed: boolean; amount: string | null }
        | null = null;
      if (
        role === 'Active' &&
        (job.state === 'completed' ||
          job.state === 'payment_sent' ||
          job.state === 'closed')
      ) {
        const ownRow = enrollmentRows.find((r) => r.activeId === ctx.userId);
        if (ownRow) {
          const confirmed = ownRow.confirmedAttendeeAt != null;
          const credit = job.perActiveDuesCredit as
            | Record<string, string>
            | null;
          const amount = confirmed
            ? (credit?.[ctx.userId] ?? null)
            : null;
          viewerCredit = { confirmed, amount };
        }
      }

      // S-M2 (AUDIT-2026-08): explicit allow-list projection — never spread the
      // raw row. The per-Active dues-credit map, the poster's contact value,
      // and dispute/cancellation/rejection reasons are scoped to the same
      // predicate as the roster (owner / privileged / enrolled viewer);
      // everyone else gets nulls.
      const seesScopedFields = seesRoster;
      return {
        id: job.id,
        postedBy: job.postedBy,
        description: job.description,
        duesAmount: job.duesAmount,
        recommendedPeopleCount: job.recommendedPeopleCount,
        state: job.state,
        workDate: job.workDate,
        posterContactKind: job.posterContactKind,
        location: job.location,
        estimatedDurationHours: job.estimatedDurationHours,
        additionalNotes: job.additionalNotes,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        perActiveDuesCredit: seesScopedFields ? job.perActiveDuesCredit : null,
        posterContactValue: seesScopedFields ? job.posterContactValue : null,
        rejectionReason: seesScopedFields ? job.rejectionReason : null,
        cancellationReason: seesScopedFields ? job.cancellationReason : null,
        disputeReason: seesScopedFields ? job.disputeReason : null,
        posterDisplayName: poster?.displayName ?? null,
        enrolleeCount,
        roster,
        closedBy,
        viewerCredit,
      };
    }),

  // Q-03 GetJobHistory — PRD-007 R-06 (Admin)
  getHistory: adminProcedure
    .input(jobIdInput)
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(jobStateTransitions)
        .where(eq(jobStateTransitions.jobId, input.jobId))
        .orderBy(asc(jobStateTransitions.createdAt));
    }),

  // Q-04 ListMyPostedJobs — PRD-002 R-11
  listMyPosted: alumniProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(jobs)
      .where(eq(jobs.postedBy, ctx.userId))
      .orderBy(desc(jobs.createdAt));
  }),

  // Q-05 ListMyEnrolledJobs — PRD-004 R-06
  listMyEnrolled: activeProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: jobs.id,
        description: jobs.description,
        duesAmount: jobs.duesAmount,
        state: jobs.state,
        workDate: jobs.workDate,
        postedBy: jobs.postedBy,
        enrolledAt: jobEnrollments.enrolledAt,
        confirmedAttendeeAt: jobEnrollments.confirmedAttendeeAt,
      })
      .from(jobEnrollments)
      .innerJoin(jobs, eq(jobs.id, jobEnrollments.jobId))
      .where(eq(jobEnrollments.activeId, ctx.userId))
      .orderBy(desc(jobs.createdAt));
    return rows;
  }),

  // Q-08 ListModerationQueue — PRD-002 R-06
  listModerationQueue: moderatorProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(jobs)
      .where(eq(jobs.state, 'awaiting_moderation' as JobState))
      .orderBy(asc(jobs.createdAt));
  }),
});
