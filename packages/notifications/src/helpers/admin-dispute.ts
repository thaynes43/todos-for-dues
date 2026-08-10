import { db } from '@app/db';
import { jobs, users } from '@app/db/schema';
import { getSetting } from '@app/settings';
import { eq } from 'drizzle-orm';
import { sendEmail, type SendEmailResult } from '../send-email';
import { AdminDispute } from '../templates/AdminDispute';

export interface SendAdminDisputeEmailInput {
  jobId: string;
  disputerId: string;
  reason: string;
}

export async function sendAdminDisputeEmail(
  input: SendAdminDisputeEmailInput,
): Promise<SendEmailResult> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, input.jobId));
  if (!job) {
    throw new Error(`Job ${input.jobId} not found for admin dispute email`);
  }

  const [disputer] = await db
    .select({ displayName: users.displayName, role: users.role })
    .from(users)
    .where(eq(users.id, input.disputerId));

  const recipient = await getSetting<string>('admin_recipient_email');
  const chapterName = await getSetting<string>('chapter_display_name');
  const baseUrl = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const subjectSuffix = job.description.length > 60
    ? `${job.description.substring(0, 60)}…`
    : job.description;

  return sendEmail({
    to: recipient,
    subject: `${chapterName} — dispute: "${subjectSuffix}"`,
    template: AdminDispute({
      jobDescription: job.description,
      jobId: job.id,
      disputerDisplayName: disputer?.displayName ?? '(unknown)',
      disputerRole: disputer?.role ?? '(unknown)',
      reason: input.reason,
      adminViewUrl: `${baseUrl}/admin/jobs/${job.id}`,
    }),
    // No idempotency key — re-disputes (after Admin resolves to payment_sent)
    // are legitimately distinct events per DESIGN-005 §4.3.
  });
}
