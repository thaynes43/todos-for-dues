import { test, expect } from '@playwright/test';
import {
  createPool,
  seedPersona,
  truncateWalkingSkeleton,
} from './support/seed';
import { signInAs } from './support/personas';

// PRD-010 / PLAN-016 — exercises every AC (AC-01..AC-07).
test.describe('PRD-010 — Job content enrichment (post-job + detail view)', () => {
  test.describe.configure({ mode: 'serial' });

  test('AC-01 + AC-04 + AC-06: Alumni posts with email contact; detail view shows enriched fields; account email is NOT leaked', async ({
    page,
  }) => {
    const pool = createPool();
    try {
      await truncateWalkingSkeleton(pool);
      const alumni = await seedPersona(pool, {
        email: 'enrich-alumni-ac1@chapter.test',
        displayName: 'Enriched Alumni One',
        role: 'Alumni',
        password: 'correct-horse-battery',
      });

      await signInAs(page, alumni.email, alumni.password);
      await page.goto('/jobs/new');
      await page.waitForLoadState('load');

      // Pre-fill: contact-value is the Alumni's account email by default.
      const contactValue = page.getByTestId('post-job-contact-value');
      await expect(contactValue).toHaveValue(alumni.email);

      // Switch to a different contact email so AC-06 (privacy invariant) bites.
      const overrideContact = 'cell-only@example.com';
      await contactValue.fill(overrideContact);

      await page
        .getByPlaceholder(/Describe the job/i)
        .fill('Rake the chapter-house lawn');
      await page.locator('input[name="duesAmount"]').fill('40');
      await page.locator('input[name="recommendedPeopleCount"]').fill('2');
      await page.getByTestId('post-job-location').fill('1234 Greek Row');
      await page.getByTestId('post-job-duration').fill('2.5');
      await page
        .getByTestId('post-job-notes')
        .fill('Door key under the mat');

      await page.getByRole('button', { name: /Post job/i }).click();
      await page.waitForURL(/\/jobs\/[0-9a-f-]+$/, { timeout: 15_000 });

      const jobId = page.url().split('/').pop()!;

      // AC-04: enriched fields render
      const detailsCard = page.getByTestId('job-details-card');
      await expect(detailsCard).toContainText(alumni.displayName);
      await expect(detailsCard).toContainText(overrideContact);
      await expect(detailsCard).toContainText('1234 Greek Row');
      await expect(detailsCard).toContainText('2.5');

      // AC-07: notes section renders
      await expect(page.getByTestId('job-notes-card')).toContainText(
        'Door key under the mat',
      );

      // AC-05 (mailto link)
      const link = page.getByTestId('job-contact-link');
      await expect(link).toHaveAttribute(
        'href',
        `mailto:${overrideContact}`,
      );

      // AC-06: account email NOT visible anywhere on the page. Reload first so
      // we test the SSR'd detail-page output, not the dev-mode RSC payload
      // carried over from /jobs/new during client-side navigation.
      await page.reload();
      await page.waitForLoadState('load');
      const html = await page.content();
      expect(html).not.toContain(alumni.email);

      // AC-01: row + audit-log inception row contain the enriched fields.
      const { rows: jobRows } = await pool.query<{
        poster_contact_kind: string;
        poster_contact_value: string;
        location: string;
        estimated_duration_hours: string;
        additional_notes: string | null;
      }>(
        `SELECT poster_contact_kind, poster_contact_value, location, estimated_duration_hours, additional_notes FROM jobs WHERE id = $1`,
        [jobId],
      );
      expect(jobRows[0]).toMatchObject({
        poster_contact_kind: 'email',
        poster_contact_value: overrideContact,
        location: '1234 Greek Row',
        additional_notes: 'Door key under the mat',
      });
      expect(parseFloat(jobRows[0]!.estimated_duration_hours)).toBe(2.5);
    } finally {
      await pool.end();
    }
  });

  test('AC-05: phone contact renders a sanitized tel: link', async ({
    page,
  }) => {
    const pool = createPool();
    try {
      await truncateWalkingSkeleton(pool);
      const alumni = await seedPersona(pool, {
        email: 'enrich-alumni-ac5@chapter.test',
        displayName: 'Enriched Alumni Five',
        role: 'Alumni',
        password: 'correct-horse-battery',
      });

      await signInAs(page, alumni.email, alumni.password);
      await page.goto('/jobs/new');
      await page.waitForLoadState('load');

      await page
        .getByPlaceholder(/Describe the job/i)
        .fill('Garage clean-out');
      await page.locator('input[name="duesAmount"]').fill('25');
      await page.locator('input[name="recommendedPeopleCount"]').fill('1');
      await page
        .getByTestId('post-job-contact-kind')
        .selectOption('phone');
      await page
        .getByTestId('post-job-contact-value')
        .fill('+1 555 123 4567');
      await page.getByTestId('post-job-location').fill('Garage');
      await page.getByTestId('post-job-duration').fill('1.5');

      await page.getByRole('button', { name: /Post job/i }).click();
      await page.waitForURL(/\/jobs\/[0-9a-f-]+$/, { timeout: 15_000 });

      const link = page.getByTestId('job-contact-link');
      await expect(link).toHaveAttribute('href', /^tel:\+?[\d ]+$/);
      const href = await link.getAttribute('href');
      // Sanitized: only +, digits, and spaces — no quote / script injection.
      expect(href!).toMatch(/^tel:\+15551234567$|^tel:\+1 555 123 4567$/);

      // No additional-notes section since notes is empty.
      await expect(page.getByTestId('job-notes-card')).toHaveCount(0);
    } finally {
      await pool.end();
    }
  });

  test('AC-02: missing contact value → inline validation error; no DB row', async ({
    page,
  }) => {
    const pool = createPool();
    try {
      const alumni = await seedPersona(pool, {
        email: 'enrich-alumni-ac2@chapter.test',
        displayName: 'Enriched Alumni Two',
        role: 'Alumni',
        password: 'correct-horse-battery',
      });

      await signInAs(page, alumni.email, alumni.password);
      await page.goto('/jobs/new');
      await page.waitForLoadState('load');

      const description = `AC2 missing contact ${Date.now()}`;
      await page.getByPlaceholder(/Describe the job/i).fill(description);
      await page.locator('input[name="duesAmount"]').fill('40');
      await page.locator('input[name="recommendedPeopleCount"]').fill('1');
      // Blank out the pre-filled contact value
      await page.getByTestId('post-job-contact-value').fill('');
      await page.getByTestId('post-job-location').fill('Somewhere');
      await page.getByTestId('post-job-duration').fill('1.5');

      const submit = page.getByRole('button', { name: /Post job/i });
      await expect(submit).toBeDisabled();

      // Inline error cites the contact field.
      await expect(
        page.getByTestId('post-job-contact-value-error'),
      ).toContainText(/contact/i);

      const { rows } = await pool.query<{ c: number }>(
        `SELECT count(*)::int AS c FROM jobs WHERE description = $1`,
        [description],
      );
      expect(rows[0]!.c).toBe(0);
    } finally {
      await pool.end();
    }
  });

  test('AC-03: duration out of range → inline validation error', async ({
    page,
  }) => {
    const pool = createPool();
    try {
      const alumni = await seedPersona(pool, {
        email: 'enrich-alumni-ac3@chapter.test',
        displayName: 'Enriched Alumni Three',
        role: 'Alumni',
        password: 'correct-horse-battery',
      });

      await signInAs(page, alumni.email, alumni.password);
      await page.goto('/jobs/new');
      await page.waitForLoadState('load');

      await page
        .getByPlaceholder(/Describe the job/i)
        .fill('Duration check');
      await page.locator('input[name="duesAmount"]').fill('40');
      await page.locator('input[name="recommendedPeopleCount"]').fill('1');
      await page.getByTestId('post-job-location').fill('Somewhere');
      // 25 is out of range (> 24)
      await page.getByTestId('post-job-duration').fill('25');

      await expect(
        page.getByTestId('post-job-duration-error'),
      ).toContainText(/duration|24/i);
      await expect(
        page.getByRole('button', { name: /Post job/i }),
      ).toBeDisabled();
    } finally {
      await pool.end();
    }
  });
});
