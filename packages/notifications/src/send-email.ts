import type { ReactElement } from 'react';
import { render } from '@react-email/render';
import { Resend } from 'resend';

const FROM_ADDRESS_DEFAULT = 'TODOs for Dues <noreply@todos-for-dues.app>';

export interface SendEmailInput {
  to: string;
  subject: string;
  template: ReactElement;
  /** Forwarded to Resend as the `Idempotency-Key` header for de-dup on retry. */
  idempotencyKey?: string;
}

export type SendEmailResult =
  | { id: string }
  | { skipped: true; reason: string };

/**
 * Test seam: when set, the adapter calls this object's `.emails.send()`
 * instead of constructing a real `Resend` client. Used by integration tests
 * that span package boundaries where `vi.mock('resend', ...)` does not reach.
 */
type ResendLike = { emails: { send: Resend['emails']['send'] } };
let injectedResend: ResendLike | undefined;

export function __setResendForTests(client: ResendLike | undefined): void {
  injectedResend = client;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email:dev] to=${input.to} subject="${input.subject}"`);
    return { skipped: true, reason: 'no RESEND_API_KEY' };
  }

  const from = process.env.RESEND_FROM_ADDRESS ?? FROM_ADDRESS_DEFAULT;
  const html = await render(input.template);
  const text = await render(input.template, { plainText: true });

  const client: ResendLike = injectedResend ?? new Resend(apiKey);
  const { data, error } = await client.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html,
    text,
    headers: input.idempotencyKey
      ? { 'Idempotency-Key': input.idempotencyKey }
      : undefined,
  });

  if (error) throw new Error(`Resend error: ${error.message ?? String(error)}`);
  if (!data) throw new Error('Resend returned no data and no error');
  return { id: data.id };
}
