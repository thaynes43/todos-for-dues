import { randomUUID } from 'node:crypto';
import type { BrowserContext, Page } from '@playwright/test';
import { Pool } from 'pg';
import {
  approveAsMod,
  completeAsAlumni,
  createPool,
  enrollAsActive,
  lockAsAlumni,
  markPaymentSentAsAlumni,
  newSuffix,
  pollJobState,
  postJob,
  reAuth,
  seedCast,
  type Cast,
  type SeededPersona,
} from '../mvp/support';

export {
  approveAsMod,
  completeAsAlumni,
  createPool,
  enrollAsActive,
  lockAsAlumni,
  markPaymentSentAsAlumni,
  newSuffix,
  pollJobState,
  postJob,
  reAuth,
  seedCast,
};
export type { Cast, SeededPersona };

/**
 * VALIDATION-010 noted that PLAN-010's MVP specs never installed a
 * `pageerror` listener (PLAN-006 walking-skeleton specs had it). Every
 * spec under `e2e/admin/` MUST install this listener so an uncaught
 * browser error fails the spec rather than silently passing.
 */
export function installPageerrorListener(page: Page): Error[] {
  const errors: Error[] = [];
  page.on('pageerror', (err) => errors.push(err));
  return errors;
}

export async function disputeAsActive(
  page: Page,
  context: BrowserContext,
  active: SeededPersona,
  pool: Pool,
  jobId: string,
  reason: string,
): Promise<void> {
  await reAuth(page, context, active);
  await page.goto(`/jobs/${jobId}`);
  await page.getByTestId('dispute-button').click();
  await page.getByTestId('dispute-reason').fill(reason);
  await page.getByTestId('dispute-submit').click();
  await pollJobState(pool, jobId, 'disputed');
}

export async function rejectAsMod(
  page: Page,
  context: BrowserContext,
  mod: SeededPersona,
  pool: Pool,
  jobId: string,
  reason: string,
): Promise<void> {
  await reAuth(page, context, mod);
  await page.goto('/moderation-queue');
  await page
    .locator(`[data-job-id="${jobId}"]`)
    .getByTestId('reject-button')
    .click();
  await page.getByTestId('reject-reason-textarea').fill(reason);
  await page.getByTestId('reject-submit').click();
  await pollJobState(pool, jobId, 'rejected');
}

export async function cancelAsAlumni(
  page: Page,
  context: BrowserContext,
  alumni: SeededPersona,
  pool: Pool,
  jobId: string,
  reason: string,
): Promise<void> {
  await reAuth(page, context, alumni);
  await page.goto(`/jobs/${jobId}`);
  await page.getByTestId('cancel-job-button').click();
  await page.getByTestId('cancel-job-reason').fill(reason);
  await page.getByTestId('cancel-job-submit').click();
  await pollJobState(pool, jobId, 'cancelled');
}

/**
 * Drive a freshly-posted job through approval / enrollment / lock / complete
 * / payment-sent / dispute so the dashboard, disputes list, and resolve
 * specs always operate on a known job. Returns the job's UUID for downstream
 * assertions.
 */
export async function driveJobToDisputed(opts: {
  page: Page;
  context: BrowserContext;
  pool: Pool;
  cast: Cast;
  description: string;
  reason: string;
}): Promise<string> {
  const { page, context, pool, cast, description, reason } = opts;
  await reAuth(page, context, cast.alumni);
  const jobId = await postJob(page, description);
  await approveAsMod(page, context, cast.mod, pool, jobId);
  await enrollAsActive(page, context, cast.active, pool, jobId);
  await lockAsAlumni(page, context, cast.alumni, pool, jobId);
  await completeAsAlumni(page, context, cast.alumni, pool, jobId);
  await markPaymentSentAsAlumni(page, context, cast.alumni, pool, jobId);
  await disputeAsActive(page, context, cast.active, pool, jobId, reason);
  return jobId;
}

export function uniqueDescription(prefix: string): string {
  return `${prefix} ${randomUUID().slice(0, 8)}`;
}
