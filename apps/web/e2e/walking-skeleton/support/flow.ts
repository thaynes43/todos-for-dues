import type { BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Pool } from 'pg';
import { seedPersona, type SeededPersona } from './seed';
import { signInAs } from './personas';

export interface FourPersonas {
  alumni: SeededPersona;
  mod: SeededPersona;
  active: SeededPersona;
  admin: SeededPersona;
}

export async function seedFourPersonas(
  pool: Pool,
  suffix: string,
): Promise<FourPersonas> {
  const password = 'correct-horse-battery';
  // Insert Admin first — the min-Admin DB trigger requires at least one Admin
  // to be present before any non-Admin insert commits.
  const admin = await seedPersona(pool, {
    email: `admin-${suffix}@walking.test`,
    displayName: `Admin ${suffix}`,
    role: 'Admin',
    password,
  });
  const alumni = await seedPersona(pool, {
    email: `alumni-${suffix}@walking.test`,
    displayName: `Alumni ${suffix}`,
    role: 'Alumni',
    password,
  });
  const mod = await seedPersona(pool, {
    email: `mod-${suffix}@walking.test`,
    displayName: `Mod ${suffix}`,
    role: 'Moderator',
    password,
  });
  const active = await seedPersona(pool, {
    email: `active-${suffix}@walking.test`,
    displayName: `Active ${suffix}`,
    role: 'Active',
    password,
  });
  return { alumni, mod, active, admin };
}

export async function reAuth(
  page: Page,
  context: BrowserContext,
  persona: SeededPersona,
): Promise<void> {
  await context.clearCookies();
  await signInAs(page, persona.email, persona.password);
}

async function pollJobState(
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
      { timeout: 10_000 },
    )
    .toBe(expected);
}

function futureLocalDatetimeMinutes(minutesAhead: number): string {
  const d = new Date(Date.now() + minutesAhead * 60_000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export interface DriveOpts {
  page: Page;
  context: BrowserContext;
  pool: Pool;
  personas: FourPersonas;
  description: string;
}

export async function driveToEnrolled(opts: DriveOpts): Promise<string> {
  const { page, context, pool, personas, description } = opts;
  await reAuth(page, context, personas.alumni);
  await page.goto('/jobs/new');
  await page.getByPlaceholder(/Describe the job/i).fill(description);
  await page.locator('input[name="duesAmount"]').fill('40');
  await page.locator('input[name="recommendedPeopleCount"]').fill('1');
  await page.getByRole('button', { name: /Post job/i }).click();
  await page.waitForURL(/\/jobs\/[0-9a-f-]+$/);
  const jobId = page.url().split('/').pop()!;

  await reAuth(page, context, personas.mod);
  await page.goto('/moderation-queue');
  await page
    .locator(`[data-job-id="${jobId}"]`)
    .getByTestId('approve-button')
    .click();
  await pollJobState(pool, jobId, 'enrollment_open');

  await reAuth(page, context, personas.active);
  await page.goto(`/jobs/${jobId}`);
  await page.getByTestId('enroll-button').click();
  await expect
    .poll(async () => {
      const { rows } = await pool.query<{ c: number }>(
        `SELECT count(*)::int AS c FROM job_enrollments WHERE job_id = $1`,
        [jobId],
      );
      return rows[0]?.c ?? 0;
    })
    .toBe(1);

  return jobId;
}

export async function driveToLocked(opts: DriveOpts): Promise<string> {
  const jobId = await driveToEnrolled(opts);
  await reAuth(opts.page, opts.context, opts.personas.alumni);
  await opts.page.goto(`/jobs/${jobId}`);
  await opts.page
    .getByTestId('lock-job-work-date')
    .fill(futureLocalDatetimeMinutes(60 * 24 * 3));
  await opts.page.getByTestId('lock-job-submit').click();
  await pollJobState(opts.pool, jobId, 'locked');
  return jobId;
}

export async function driveToCompleted(opts: DriveOpts): Promise<string> {
  const jobId = await driveToLocked(opts);
  await reAuth(opts.page, opts.context, opts.personas.alumni);
  await opts.page.goto(`/jobs/${jobId}`);
  await opts.page.getByTestId('complete-job-submit').click();
  await pollJobState(opts.pool, jobId, 'completed');
  return jobId;
}

export async function driveToPaymentSent(opts: DriveOpts): Promise<string> {
  const jobId = await driveToCompleted(opts);
  await reAuth(opts.page, opts.context, opts.personas.alumni);
  await opts.page.goto(`/jobs/${jobId}`);
  await opts.page.getByTestId('mark-payment-sent-button').click();
  await pollJobState(opts.pool, jobId, 'payment_sent');
  return jobId;
}
