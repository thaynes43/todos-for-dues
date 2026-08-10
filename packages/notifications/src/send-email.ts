import type { ReactElement } from 'react';
import { render } from '@react-email/render';
import { Resend } from 'resend';

/**
 * Boot-time guard: in production, refuse to load if `RESEND_FROM_ADDRESS` is
 * missing or still points at the placeholder `@todos-for-dues.app` domain
 * (which is not Resend-verified — sends would fail silently). Gated strictly
 * on `NODE_ENV === 'production'` so Vitest (`NODE_ENV=test`) and local dev are
 * unaffected.
 *
 * Skipped during `next build` (`NEXT_PHASE === 'phase-production-build'`):
 * Next.js's page-data collection runs in NODE_ENV=production but without the
 * runtime env, so a module-load throw would break the build. The guard still
 * fires on real production server boot (NEXT_PHASE=phase-production-server,
 * or unset for non-Next.js runtimes) — where the env var is required.
 *
 * Exported for direct test coverage.
 */
export function assertValidResendFromAddressOrThrow(): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const from = process.env.RESEND_FROM_ADDRESS;
  if (!from || from.includes('@todos-for-dues.app')) {
    throw new Error(
      'RESEND_FROM_ADDRESS must be a verified Resend domain in production; ' +
        'placeholder "@todos-for-dues.app" detected.',
    );
  }
}
assertValidResendFromAddressOrThrow();

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

/**
 * Out-of-process Playwright test seam (PLAN-008 Trap 7). The in-process
 * `__setResendForTests` hook above can't reach the separate Next.js dev
 * server, so when `RESEND_TEST_MODE === 'true'` we record every send into an
 * in-memory store that the dev server exposes via the test-only
 * `/api/test/resend-calls` route. No-ops in production (the env var is set
 * only by Playwright's globalSetup).
 */
export interface RecordedEmail {
  to: string;
  subject: string;
  from: string;
  html: string;
  text: string;
  idempotencyKey?: string;
  recordedAt: string;
}
const recordedEmails: RecordedEmail[] = [];

export function getRecordedEmails(): readonly RecordedEmail[] {
  return [...recordedEmails];
}

export function clearRecordedEmails(): void {
  recordedEmails.length = 0;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (process.env.RESEND_TEST_MODE === 'true') {
    const from = process.env.RESEND_FROM_ADDRESS ?? FROM_ADDRESS_DEFAULT;
    const html = await render(input.template);
    const text = await render(input.template, { plainText: true });
    recordedEmails.push({
      to: input.to,
      subject: input.subject,
      from,
      html,
      text,
      idempotencyKey: input.idempotencyKey,
      recordedAt: new Date().toISOString(),
    });
    return { id: `test-${recordedEmails.length}` };
  }

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
