import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import { readRuntimeEnv } from './fixtures/runtime-env';
import {
  loginViaForm,
  logoutAndClear,
  newPersona,
  seedInviteToken,
  signupViaInvite,
} from './fixtures/personas';

/**
 * PLAN-008 canonical walking-skeleton spec — the single chained Playwright
 * happy-path that drives the full UI flow against the full stack: real
 * Postgres (testcontainer), real Better Auth, real tRPC, real Next.js,
 * Resend mocked at the SDK seam via RESEND_TEST_MODE (PLAN-008 Trap 7).
 *
 * Personas in play (per PLAN-008 §4 Step 3):
 *   - Admin: pre-seeded by globalSetup (BOOTSTRAP_ADMIN_EMAIL).
 *   - Moderator: pre-seeded by globalSetup.
 *   - Alumni: signs up via invite-token form during the test.
 *   - Active 1 + Active 2: sign up via invite-token forms (Q-PLN-01 — two
 *     Actives exercises the dues-split rounding edge case from PRD-005 R-04).
 *
 * Audit log assertion (Trap 4): the spec enumerates the 7 FSM transitions
 * in order; the two enroll-relationship rows (fromState === toState ===
 * enrollment_open, note: 'enroll') that sit between rows 3 and 4 of the
 * canonical sequence are filtered out explicitly so the assertion stays
 * deterministic across multi-Active permutations.
 */

function futureLocalDatetimeMinutes(minutesAhead: number): string {
  const d = new Date(Date.now() + minutesAhead * 60_000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

async function pollState(
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

test.describe('PLAN-008 walking skeleton — full happy-path job loop', () => {
  test('Admin invites → Alumni posts → Mod approves → Actives enroll → Alumni locks → completes → markPaymentSent → Active confirms = closed', async ({
    page,
  }) => {
    const env = readRuntimeEnv();
    const pool = new Pool({ connectionString: env.DATABASE_URL });

    // Distinguishing description per run so audit/assertion queries are
    // scoped tightly even when workers > 1 run multiple chained specs.
    const description = `Help me move a couch — ${randomUUID()}`;

    const alumni = newPersona('Alumni', 'Move Couch Alumni');
    const active1 = newPersona('Active', 'Active One');
    const active2 = newPersona('Active', 'Active Two');

    let jobId: string;
    let active1Id: string;
    let active2Id: string;
    let alumniInviteToken: string;
    let active1InviteToken: string;
    let active2InviteToken: string;

    try {
      // ── 0. Admin signs in (pre-seeded) and "issues" invite tokens. ──
      await test.step('Admin signs in + issues invites', async () => {
        await loginViaForm(page, {
          email: env.BOOTSTRAP_ADMIN_EMAIL,
          password: env.E2E_SEED_PASSWORD,
        });

        // Fetch the pre-seeded admin's id for the invite-token FK.
        const adminRow = await pool.query<{ id: string }>(
          `SELECT id FROM users WHERE email = $1`,
          [env.BOOTSTRAP_ADMIN_EMAIL],
        );
        const adminId = adminRow.rows[0]!.id;

        alumniInviteToken = await seedInviteToken(pool, {
          preselectedRole: 'Alumni',
          createdBy: adminId,
        });
        active1InviteToken = await seedInviteToken(pool, {
          preselectedRole: 'Active',
          createdBy: adminId,
        });
        active2InviteToken = await seedInviteToken(pool, {
          preselectedRole: 'Active',
          createdBy: adminId,
        });
      });

      // ── 1. Alumni signs up via invite → posts a job. ──
      await test.step('Alumni signs up + posts a job', async () => {
        await logoutAndClear(page);
        await signupViaInvite(page, {
          token: alumniInviteToken,
          persona: alumni,
        });

        await page.goto('/jobs/new');
        await page.getByPlaceholder(/Describe the job/i).fill(description);
        await page.locator('input[name="duesAmount"]').fill('50');
        await page.locator('input[name="recommendedPeopleCount"]').fill('2');
        await page.getByTestId('post-job-location').fill('Test Location');
        await page.getByTestId('post-job-duration').fill('1.5');
        await page.getByRole('button', { name: /Post job/i }).click();
        await page.waitForURL(/\/jobs\/[0-9a-f-]+$/, { timeout: 15_000 });
        jobId = page.url().split('/').pop()!;
        await expect(page.getByTestId('job-state-badge')).toHaveText(
          /awaiting moderation/,
        );
      });

      // ── 2. Moderator approves. ──
      await test.step('Moderator approves the job', async () => {
        await logoutAndClear(page);
        await loginViaForm(page, {
          email: env.E2E_SEED_MODERATOR_EMAIL,
          password: env.E2E_SEED_PASSWORD,
        });
        await page.goto('/moderation-queue');
        await page
          .locator(`[data-job-id="${jobId}"]`)
          .getByTestId('approve-button')
          .click();
        await pollState(pool, jobId, 'enrollment_open');
      });

      // ── 3a. Active 1 signs up + enrolls. ──
      await test.step('Active 1 signs up + enrolls', async () => {
        await logoutAndClear(page);
        await signupViaInvite(page, {
          token: active1InviteToken,
          persona: active1,
        });
        const row = await pool.query<{ id: string }>(
          `SELECT id FROM users WHERE email = $1`,
          [active1.email],
        );
        active1Id = row.rows[0]!.id;

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
          .toBeGreaterThanOrEqual(1);
      });

      // ── 3b. Active 2 signs up + enrolls (dues-split sanity per Q-PLN-01). ──
      await test.step('Active 2 signs up + enrolls', async () => {
        await logoutAndClear(page);
        await signupViaInvite(page, {
          token: active2InviteToken,
          persona: active2,
        });
        const row = await pool.query<{ id: string }>(
          `SELECT id FROM users WHERE email = $1`,
          [active2.email],
        );
        active2Id = row.rows[0]!.id;

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
          .toBe(2);
      });

      // ── 4. Alumni locks with a future work date. ──
      await test.step('Alumni locks the job', async () => {
        await logoutAndClear(page);
        await loginViaForm(page, alumni);
        await page.goto(`/jobs/${jobId}`);
        await page
          .getByTestId('lock-job-work-date')
          .fill(futureLocalDatetimeMinutes(60 * 24 * 2));
        await page.getByTestId('lock-job-submit').click();
        await pollState(pool, jobId, 'locked');
      });

      // ── 5. Alumni completes — both Actives default-checked as attendees. ──
      await test.step('Alumni completes (both Actives attended)', async () => {
        await page.goto(`/jobs/${jobId}`);
        await expect(
          page.getByTestId(`complete-attendee-${active1Id}`),
        ).toBeChecked();
        await expect(
          page.getByTestId(`complete-attendee-${active2Id}`),
        ).toBeChecked();
        await page.getByTestId('complete-job-submit').click();
        await pollState(pool, jobId, 'completed');

        // PRD-005 R-04 — even-split: $50 ÷ 2 Actives = $25.00 each.
        const credit = await pool.query<{ per_active_dues_credit: unknown }>(
          `SELECT per_active_dues_credit FROM jobs WHERE id = $1`,
          [jobId],
        );
        const map = credit.rows[0]?.per_active_dues_credit as Record<
          string,
          string
        >;
        expect(map[active1Id]).toBe('25.00');
        expect(map[active2Id]).toBe('25.00');
      });

      // ── 6. Mark payment-sent and assert the Treasurer email fired. ──
      await test.step('Alumni marks payment-sent → TreasurerBreakdown queued', async () => {
        // NOTE: the Resend recorder is a process-global array (a single
        // dev-server instance is shared by all Playwright workers), so a
        // DELETE+expect-length-1 pattern races with other specs that emit
        // moderator-queue / treasurer notifications. Instead, filter the
        // array by THIS job's idempotencyKey before asserting — workers > 1
        // safe.
        const idempotencyKey = `job:${jobId}:payment_sent`;

        await page.goto(`/jobs/${jobId}`);
        await page.getByTestId('mark-payment-sent-button').click();
        await pollState(pool, jobId, 'payment_sent');

        type Call = {
          to: string;
          subject: string;
          from: string;
          idempotencyKey?: string;
          html: string;
        };

        await expect
          .poll(async () => {
            const resp = await page.request.get('/api/test/resend-calls');
            if (!resp.ok()) return [];
            const all = (await resp.json()) as Call[];
            return all.filter((c) => c.idempotencyKey === idempotencyKey);
          })
          .toHaveLength(1);

        const resp = await page.request.get('/api/test/resend-calls');
        const all = (await resp.json()) as Call[];
        const mine = all.filter((c) => c.idempotencyKey === idempotencyKey);
        expect(mine[0]!.to).toBe(env.BOOTSTRAP_TREASURER_RECIPIENT_EMAIL);
        expect(mine[0]!.subject).toContain(
          `payment sent: "Help me move a couch`,
        );
        // Per-Active credit ($25.00) renders in the HTML body.
        expect(mine[0]!.html).toContain('$25.00');
      });

      // ── 7. Active 1 confirms received → job closes. ──
      await test.step('Active 1 confirms received → state = closed', async () => {
        await logoutAndClear(page);
        await loginViaForm(page, active1);
        await page.goto(`/jobs/${jobId}`);
        await page.getByTestId('confirm-received-button').click();
        await pollState(pool, jobId, 'closed');
        await page.goto(`/jobs/${jobId}`);
        await expect(page.getByTestId('job-state-badge')).toHaveText(/closed/);
      });

      // ── 8. Audit-log assertion (PLAN-008 §5 + Trap 4). ──
      await test.step('Audit log: 7 FSM transitions in order', async () => {
        const { rows } = await pool.query<{
          from_state: string | null;
          to_state: string;
          note: string | null;
        }>(
          `SELECT from_state, to_state, note FROM job_state_transitions
           WHERE job_id = $1 ORDER BY created_at, ctid`,
          [jobId],
        );

        // Filter out enroll-relationship rows (same-state, note='enroll')
        // per VALIDATION-008 §5 — they're optional in the assertion.
        const fsm = rows.filter(
          (r) => !(r.from_state === r.to_state && r.note === 'enroll'),
        );
        const arrow = fsm.map((r) => `${r.from_state ?? 'null'}→${r.to_state}`);
        expect(arrow).toEqual([
          'null→awaiting_moderation',
          'awaiting_moderation→approved',
          'approved→enrollment_open',
          'enrollment_open→locked',
          'locked→completed',
          'completed→payment_sent',
          'payment_sent→closed',
        ]);

        // Also confirm the enroll-relationship rows DID happen (2 Actives).
        const enrolls = rows.filter(
          (r) => r.from_state === r.to_state && r.note === 'enroll',
        );
        expect(enrolls.length).toBeGreaterThanOrEqual(2);
      });
    } finally {
      await pool.end();
    }
  });
});
