import { randomUUID } from 'node:crypto';
import { expect, type BrowserContext, type Page } from '@playwright/test';
import { Pool } from 'pg';

/**
 * VALIDATION-010 noted that PLAN-010's MVP specs never installed a
 * `pageerror` listener (PLAN-006 walking-skeleton specs had it). Every
 * spec under `e2e/mvp/` MUST install this listener so an uncaught
 * browser error fails the spec rather than silently passing.
 *
 * Mirrors `apps/web/e2e/admin/support.ts:installPageerrorListener`
 * line-for-line.
 */
export function installPageerrorListener(page: Page): Error[] {
  const errors: Error[] = [];
  page.on('pageerror', (err) => errors.push(err));
  return errors;
}
import {
  createPool,
  seedPersona,
  type SeededPersona,
} from '../walking-skeleton/support/seed';
import { signInAs } from '../walking-skeleton/support/personas';

export { createPool, seedPersona, signInAs };
export type { SeededPersona };

export interface Cast {
  alumni: SeededPersona;
  mod: SeededPersona;
  active: SeededPersona;
  admin: SeededPersona;
}

const PASSWORD = 'correct-horse-battery';

/**
 * PLAN-010 mvp specs need at least an Alumni + Moderator + Active per scenario.
 * Each spec generates UUID-suffixed identifiers so workers > 1 stays flake-free
 * (matches PLAN-008's pattern).
 */
export async function seedCast(
  pool: Pool,
  suffix: string,
): Promise<Cast> {
  // Min-admin trigger requires an Admin in the chapter — globalSetup seeds
  // one, but to keep specs self-contained we make sure at least one Admin
  // exists with our suffix.
  const admin = await seedPersona(pool, {
    email: `mvp-admin-${suffix}@chapter.test`,
    displayName: `MVP Admin ${suffix}`,
    role: 'Admin',
    password: PASSWORD,
  });
  const alumni = await seedPersona(pool, {
    email: `mvp-alumni-${suffix}@chapter.test`,
    displayName: `MVP Alumni ${suffix}`,
    role: 'Alumni',
    password: PASSWORD,
  });
  const mod = await seedPersona(pool, {
    email: `mvp-mod-${suffix}@chapter.test`,
    displayName: `MVP Mod ${suffix}`,
    role: 'Moderator',
    password: PASSWORD,
  });
  const active = await seedPersona(pool, {
    email: `mvp-active-${suffix}@chapter.test`,
    displayName: `MVP Active ${suffix}`,
    role: 'Active',
    password: PASSWORD,
  });
  return { alumni, mod, active, admin };
}

export function newSuffix(): string {
  return randomUUID().slice(0, 8);
}

export async function reAuth(
  page: Page,
  context: BrowserContext,
  persona: SeededPersona,
): Promise<void> {
  await context.clearCookies();
  await signInAs(page, persona.email, persona.password);
  // After the post-signin redirect to '/', wait for the network to go idle
  // so Better Auth's Set-Cookie has been fully processed by Playwright's
  // cookie jar AND any layout-level role lookup has completed. Without this,
  // a fast goto('/admin/X') immediately after reAuth can race the session
  // hydration — the admin layout reads a stale or missing session role and
  // redirects to '/' instead of rendering the admin page.
  await page.waitForLoadState('load');
}

export async function pollJobState(
  pool: Pool,
  jobId: string,
  expected: string,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const { rows } = await pool.query<{ state: string }>(
          `SELECT state FROM jobs WHERE id = $1`,
          [jobId],
        );
        return rows[0]?.state;
      },
      { timeout: 15_000 },
    )
    .toBe(expected);
}

export function futureLocalDatetimeMinutes(minutesAhead: number): string {
  const d = new Date(Date.now() + minutesAhead * 60_000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export async function postJob(
  page: Page,
  description: string,
  duesAmount = '40',
  recommended = '1',
): Promise<string> {
  await page.goto('/jobs/new');
  // Dev-server compile-lag (PLAN-013 Track B Path A): under parallel-spec load,
  // Next.js may still be compiling /jobs/new when goto resolves. Wait for the
  // network to go idle so the page is fully hydrated before driving the form.
  await page.waitForLoadState('load');
  // Wait for the form to mount + hydrate. The submit button is initially
  // disabled until React state has caught up to the form's inputs, so a
  // stable "submit is enabled" tells us hydration finished AND validation
  // accepted the inputs.
  const submit = page.getByRole('button', { name: /Post job/i });
  await expect(submit).toBeVisible();
  const descBox = page.getByPlaceholder(/Describe the job/i);
  await descBox.click();
  await descBox.fill(description);
  const duesBox = page.locator('input[name="duesAmount"]');
  await duesBox.click();
  await duesBox.fill(duesAmount);
  const countBox = page.locator('input[name="recommendedPeopleCount"]');
  await countBox.click();
  await countBox.fill(recommended);
  await expect(submit).toBeEnabled({ timeout: 30_000 });
  await submit.click();
  await page.waitForURL(/\/jobs\/[0-9a-f-]+$/, { timeout: 15_000 });
  return page.url().split('/').pop()!;
}

export async function approveAsMod(
  page: Page,
  context: BrowserContext,
  mod: SeededPersona,
  pool: Pool,
  jobId: string,
): Promise<void> {
  await reAuth(page, context, mod);
  await page.goto('/moderation-queue');
  await page
    .locator(`[data-job-id="${jobId}"]`)
    .getByTestId('approve-button')
    .click();
  await pollJobState(pool, jobId, 'enrollment_open');
}

export async function enrollAsActive(
  page: Page,
  context: BrowserContext,
  active: SeededPersona,
  pool: Pool,
  jobId: string,
): Promise<void> {
  await reAuth(page, context, active);
  await page.goto(`/jobs/${jobId}`);
  const button = page.getByTestId('enroll-button');
  await expect(button).toBeVisible();
  // Retry click loop: in dev mode React hydration can race with Playwright's
  // click, swallowing the first click silently. Re-click until the DB row
  // appears or we give up.
  await expect
    .poll(
      async () => {
        const { rows } = await pool.query<{ c: number }>(
          `SELECT count(*)::int AS c FROM job_enrollments WHERE job_id = $1 AND active_id = $2`,
          [jobId, active.id],
        );
        if ((rows[0]?.c ?? 0) >= 1) return true;
        if (await button.isEnabled().catch(() => false)) {
          await button.click({ trial: false }).catch(() => undefined);
        }
        return false;
      },
      { timeout: 20_000, intervals: [200, 500, 1000] },
    )
    .toBe(true);
}

export async function lockAsAlumni(
  page: Page,
  context: BrowserContext,
  alumni: SeededPersona,
  pool: Pool,
  jobId: string,
): Promise<void> {
  await reAuth(page, context, alumni);
  await page.goto(`/jobs/${jobId}`);
  // Wait for hydration: the lock-job submit stays disabled until validation
  // accepts the work-date. On cold GHA runners the form hydration can lag
  // past the default click timeout.
  await page.waitForLoadState('load');
  await page
    .getByTestId('lock-job-work-date')
    .fill(futureLocalDatetimeMinutes(60 * 24 * 3));
  const submit = page.getByTestId('lock-job-submit');
  await expect(submit).toBeEnabled({ timeout: 30_000 });
  await submit.click();
  await pollJobState(pool, jobId, 'locked');
}

export async function completeAsAlumni(
  page: Page,
  context: BrowserContext,
  alumni: SeededPersona,
  pool: Pool,
  jobId: string,
): Promise<void> {
  await reAuth(page, context, alumni);
  await page.goto(`/jobs/${jobId}`);
  await page.waitForLoadState('load');
  const submit = page.getByTestId('complete-job-submit');
  await expect(submit).toBeEnabled({ timeout: 30_000 });
  await submit.click();
  await pollJobState(pool, jobId, 'completed');
}

export async function markPaymentSentAsAlumni(
  page: Page,
  context: BrowserContext,
  alumni: SeededPersona,
  pool: Pool,
  jobId: string,
): Promise<void> {
  await reAuth(page, context, alumni);
  await page.goto(`/jobs/${jobId}`);
  await page.waitForLoadState('load');
  const submit = page.getByTestId('mark-payment-sent-button');
  await expect(submit).toBeEnabled({ timeout: 30_000 });
  await submit.click();
  await pollJobState(pool, jobId, 'payment_sent');
}
