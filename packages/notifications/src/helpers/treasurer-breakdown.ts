import { db } from '@app/db';
import { jobs, users } from '@app/db/schema';
import { getSetting } from '@app/settings';
import { eq, inArray } from 'drizzle-orm';
import { sendEmail, type SendEmailResult } from '../send-email';
import { TreasurerBreakdown } from '../templates/TreasurerBreakdown';

export interface SendTreasurerEmailInput {
  jobId: string;
}

export async function sendTreasurerEmail(
  input: SendTreasurerEmailInput,
): Promise<SendEmailResult> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, input.jobId));
  if (!job) {
    throw new Error(`Job ${input.jobId} not found for treasurer email`);
  }
  if (!job.perActiveDuesCredit) {
    throw new Error(
      `Job ${input.jobId} has no per-Active credit map; run completion before payment-sent`,
    );
  }

  const creditMap = job.perActiveDuesCredit as Record<string, string>;
  const userIds = Object.keys(creditMap);
  const usersList =
    userIds.length > 0
      ? await db
          .select({ id: users.id, displayName: users.displayName })
          .from(users)
          .where(inArray(users.id, userIds))
      : [];
  const nameById = new Map(usersList.map((u) => [u.id, u.displayName]));
  const lineItems = userIds
    .map((id) => ({
      displayName: nameById.get(id) ?? '(unknown user)',
      amount: creditMap[id]!,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const recipient = await getSetting<string>('treasurer_recipient_email');
  const chapterName = await getSetting<string>('chapter_display_name');
  const subjectSuffix = job.description.length > 60
    ? `${job.description.substring(0, 60)}…`
    : job.description;

  return sendEmail({
    to: recipient,
    subject: `${chapterName} — payment-sent for "${subjectSuffix}"`,
    template: TreasurerBreakdown({
      jobDescription: job.description,
      jobId: job.id,
      totalAmount: job.duesAmount,
      lineItems,
      timestamp: new Date(),
    }),
    idempotencyKey: `job:${job.id}:payment_sent`,
  });
}
