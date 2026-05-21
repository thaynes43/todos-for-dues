import { db } from '@app/db';
import { jobs, jobEnrollments, users, type JobState } from '@app/db/schema';
import { eq } from 'drizzle-orm';
import { sendEmail, type SendEmailResult } from '../send-email';
import { ActiveJobEdited } from '../templates/ActiveJobEdited';

export interface SendActiveJobEditedEmailsInput {
  jobId: string;
  diff: Record<string, { before: unknown; after: unknown }>;
  // The job's state *after* the edit lands (potentially demoted to
  // awaiting_moderation). Surfaced in the email body so the Active understands
  // the re-review pause.
  newJobState: JobState;
  // PRD-011 R-08-style idempotency: a per-edit suffix so a retry of the same
  // edit doesn't fan out twice. The tRPC layer passes the audit row id.
  editId: string;
}

export interface SendActiveJobEditedResult {
  enrolleeCount: number;
  results: SendEmailResult[];
}

/**
 * PRD-011 R-10 — fan out to every currently-enrolled Active.
 *
 * One email per Active; no batching for MVP. Each send carries an
 * Idempotency-Key suffixed with the edit id so Resend de-dupes retries.
 * Failures of one send do NOT abort the rest — we collect results and let the
 * caller log; the underlying transaction has already committed.
 */
export async function sendActiveJobEditedEmails(
  input: SendActiveJobEditedEmailsInput,
): Promise<SendActiveJobEditedResult> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, input.jobId));
  if (!job) {
    throw new Error(`Job ${input.jobId} not found for active-edit fan-out`);
  }

  const [poster] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, job.postedBy));

  const enrollees = await db
    .select({
      email: users.email,
      displayName: users.displayName,
    })
    .from(jobEnrollments)
    .innerJoin(users, eq(users.id, jobEnrollments.activeId))
    .where(eq(jobEnrollments.jobId, input.jobId));

  const baseUrl = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const jobUrl = `${baseUrl}/jobs/${job.id}`;
  const changes = Object.entries(input.diff).map(([field, ba]) => ({
    field,
    before: ba.before,
    after: ba.after,
  }));

  const results: SendEmailResult[] = [];
  for (const enrollee of enrollees) {
    const result = await sendEmail({
      to: enrollee.email,
      subject: `Job updated: "${job.description.substring(0, 60)}"`,
      template: ActiveJobEdited({
        jobId: job.id,
        jobDescription: job.description,
        posterDisplayName: poster?.displayName ?? '(unknown)',
        changes,
        newJobState: input.newJobState,
        jobUrl,
      }),
      idempotencyKey: `job:${job.id}:edit:${input.editId}:active:${enrollee.email}`,
    });
    results.push(result);
  }

  return { enrolleeCount: enrollees.length, results };
}
