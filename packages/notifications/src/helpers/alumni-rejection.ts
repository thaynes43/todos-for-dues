import { db } from '@app/db';
import { jobs, users } from '@app/db/schema';
import { getSetting } from '@app/settings';
import { eq } from 'drizzle-orm';
import { sendEmail, type SendEmailResult } from '../send-email';
import { AlumniRejection } from '../templates/AlumniRejection';

export interface SendAlumniRejectionEmailInput {
  jobId: string;
  reason: string;
}

export async function sendAlumniRejectionEmail(
  input: SendAlumniRejectionEmailInput,
): Promise<SendEmailResult> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, input.jobId));
  if (!job) {
    throw new Error(`Job ${input.jobId} not found for alumni rejection email`);
  }

  const [poster] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, job.postedBy));
  if (!poster?.email) {
    throw new Error(`Posting Alumni ${job.postedBy} has no email on file`);
  }

  const chapterName = await getSetting<string>('chapter_display_name');
  const subjectSuffix = job.description.length > 60
    ? `${job.description.substring(0, 60)}…`
    : job.description;

  return sendEmail({
    to: poster.email,
    subject: `${chapterName} — your posting "${subjectSuffix}" was not approved`,
    template: AlumniRejection({
      jobDescription: job.description,
      reason: input.reason,
    }),
    idempotencyKey: `job:${job.id}:rejected`,
  });
}
