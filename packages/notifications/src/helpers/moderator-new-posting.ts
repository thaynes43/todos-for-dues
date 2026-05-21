import { db } from '@app/db';
import { jobs, users } from '@app/db/schema';
import { getSetting } from '@app/settings';
import { eq } from 'drizzle-orm';
import { sendEmail, type SendEmailResult } from '../send-email';
import { ModeratorNewPosting } from '../templates/ModeratorNewPosting';

export interface SendModeratorQueueEmailInput {
  jobId: string;
  // PRD-011 R-08: when a material edit demotes the job back to
  // awaiting_moderation, the re-review email subject begins with `[Re-review]`
  // so moderators can distinguish it from a brand-new posting.
  subjectPrefix?: string;
  // Per-event idempotency suffix. Defaults to `moderation_queue` (the initial
  // posting). Re-review sends pass a per-edit suffix so the Resend
  // Idempotency-Key doesn't collide with the original send.
  idempotencyKeySuffix?: string;
}

export async function sendModeratorQueueEmail(
  input: SendModeratorQueueEmailInput,
): Promise<SendEmailResult> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, input.jobId));
  if (!job) {
    throw new Error(`Job ${input.jobId} not found for moderator queue email`);
  }

  const [poster] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, job.postedBy));

  const recipient = await getSetting<string>('moderators_recipient_email');
  const chapterName = await getSetting<string>('chapter_display_name');
  const baseUrl = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const subjectSuffix = job.description.length > 60
    ? `${job.description.substring(0, 60)}…`
    : job.description;

  const prefix = input.subjectPrefix ? `${input.subjectPrefix} ` : '';
  const idempotencySuffix = input.idempotencyKeySuffix ?? 'moderation_queue';

  return sendEmail({
    to: recipient,
    subject: `${prefix}${chapterName} — new posting awaiting moderation: "${subjectSuffix}"`,
    template: ModeratorNewPosting({
      jobDescription: job.description,
      jobId: job.id,
      posterDisplayName: poster?.displayName ?? '(unknown)',
      duesAmount: job.duesAmount,
      recommendedPeopleCount: job.recommendedPeopleCount,
      moderationQueueUrl: `${baseUrl}/moderation-queue`,
    }),
    idempotencyKey: `job:${job.id}:${idempotencySuffix}`,
  });
}
