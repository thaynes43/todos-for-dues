import { test, expect, type Page } from '@playwright/test';
import {
  approveAsMod,
  createPool,
  enrollAsActive,
  installPageerrorListener,
  newSuffix,
  postJob,
  pollJobState,
  reAuth,
  seedCast,
  type Cast,
  type SeededPersona,
} from './support';

// PRD-012 / ADR-012 / PLAN-018 — Real-time cross-session UI updates via SSE.
//
// The headline use case (PRD-012 R-01..R-07, AC-01..AC-06): when user A
// mutates a job, user B's open browser tab reflects the change within 2s
// without any manual refresh.
//
// This spec is the regression guard. It runs with TWO independent browser
// contexts so each session has its own cookie jar — mirroring real-world
// multi-user use. Each AC test asserts the cross-session UI swap WITHOUT
// page.reload() within a tight 5s window (PRD's 2s P95 budget plus a 3s
// CI-jitter cushion).

const CROSS_SESSION_TIMEOUT = 5_000;

async function signInPage(
  page: Page,
  context: import('@playwright/test').BrowserContext,
  persona: SeededPersona,
): Promise<void> {
  await reAuth(page, context, persona);
}

async function postAndApprove(
  ctx: { page: Page; context: import('@playwright/test').BrowserContext },
  cast: Cast,
  pool: ReturnType<typeof createPool>,
  description: string,
): Promise<string> {
  await signInPage(ctx.page, ctx.context, cast.alumni);
  const jobId = await postJob(ctx.page, description);
  await approveAsMod(ctx.page, ctx.context, cast.mod, pool, jobId);
  return jobId;
}

test.describe('PRD-012 — cross-session real-time updates (SSE)', () => {
  // AC-01: list-view cross-session — Active sees a newly-approved job appear
  // in /jobs within 2s of the moderator approving it, without refreshing.
  test('AC-01: Active on /jobs sees a newly-approved job appear without refresh', async ({
    browser,
  }) => {
    const pool = createPool();
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    installPageerrorListener(pageA);
    installPageerrorListener(pageB);

    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);
      const description = `Real-time AC-01 — ${suffix}`;

      // Session B (Active) opens /jobs and stays there. Capture the URL so
      // the assertion later can prove no navigation occurred.
      await signInPage(pageB, ctxB, cast.active);
      await pageB.goto('/jobs');
      await pageB.waitForLoadState('load');
      const startUrl = pageB.url();

      // Session A drives the post + moderator approval (uses its own context
      // so cookies don't collide with B's).
      const ctxAMod = await browser.newContext();
      const pageAMod = await ctxAMod.newPage();
      installPageerrorListener(pageAMod);
      try {
        const jobId = await postAndApprove(
          { page: pageAMod, context: ctxAMod },
          cast,
          pool,
          description,
        );

        // The job is now enrollment_open in the DB. Session B's /jobs page
        // must reflect it within the cross-session budget — without reload.
        const link = pageB.locator(`a[href="/jobs/${jobId}"]`);
        await expect(link).toBeVisible({ timeout: CROSS_SESSION_TIMEOUT });
        await expect(link).toContainText(description);
        expect(pageB.url()).toBe(startUrl);
      } finally {
        await ctxAMod.close();
      }
    } finally {
      await pageA.close();
      await pageB.close();
      await ctxA.close();
      await ctxB.close();
      await pool.end();
    }
  });

  // AC-02: detail-view cross-session — Active viewing /jobs/[id] sees an
  // Alumni edit reflected within 2s without refresh.
  test('AC-02: Active on /jobs/[id] sees an Alumni edit without refresh', async ({
    browser,
  }) => {
    const pool = createPool();
    const ctxAlumni = await browser.newContext();
    const ctxActive = await browser.newContext();
    const pageAlumni = await ctxAlumni.newPage();
    const pageActive = await ctxActive.newPage();
    installPageerrorListener(pageAlumni);
    installPageerrorListener(pageActive);

    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);
      const original = `Edit cross-session — ${suffix}`;
      const updated = `Edit cross-session UPDATED — ${suffix}`;

      // Alumni posts; moderator approves (uses Alumni's context).
      const jobId = await postAndApprove(
        { page: pageAlumni, context: ctxAlumni },
        cast,
        pool,
        original,
      );

      // After approveAsMod, pageAlumni's context cookies are now moderator.
      // Re-auth as Alumni for the edit step.
      await reAuth(pageAlumni, ctxAlumni, cast.alumni);

      // Active opens the job detail page; sees the original description.
      await signInPage(pageActive, ctxActive, cast.active);
      await pageActive.goto(`/jobs/${jobId}`);
      await pageActive.waitForLoadState('load');
      await expect(pageActive.getByTestId('job-description')).toContainText(
        original,
      );
      const startUrl = pageActive.url();

      // Alumni edits the description (cosmetic-only path keeps state in
      // enrollment_open; the edit still publishes a job.edited event).
      await pageAlumni.goto(`/jobs/${jobId}`);
      await pageAlumni.waitForLoadState('load');
      const editBtn = pageAlumni.getByTestId('edit-job-button');
      await expect(editBtn).toBeVisible();
      await editBtn.click();
      const modal = pageAlumni.getByTestId('edit-job-modal');
      await expect(modal).toBeVisible();
      const desc = modal.getByTestId('edit-description-input');
      await desc.fill(updated);
      const submit = modal.getByTestId('edit-submit');
      await expect(submit).toBeEnabled({ timeout: 15_000 });
      await submit.click();
      await expect(modal).toBeHidden({ timeout: 15_000 });

      // Active's detail view must show the new description without reload.
      await expect(pageActive.getByTestId('job-description')).toContainText(
        updated,
        { timeout: CROSS_SESSION_TIMEOUT },
      );
      expect(pageActive.url()).toBe(startUrl);
    } finally {
      await pageAlumni.close();
      await pageActive.close();
      await ctxAlumni.close();
      await ctxActive.close();
      await pool.end();
    }
  });

  // AC-04: Graceful degradation — when EventSource is blocked, the app loads
  // and the rest of the UX works. We block by overriding `window.EventSource`
  // to a constructor that throws so the consumer's `useEffect` swallows it.
  test('AC-04: app loads + functions when EventSource is unavailable (graceful degradation)', async ({
    browser,
  }) => {
    const pool = createPool();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    installPageerrorListener(page);

    // Override EventSource BEFORE any navigation so React's first effect sees
    // the throwing constructor. Must happen at addInitScript time.
    await ctx.addInitScript(() => {
      (window as unknown as { EventSource: unknown }).EventSource = function () {
        throw new Error('EventSource blocked for AC-04 test');
      } as unknown as typeof EventSource;
    });

    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);

      // Sign in as Active and navigate to /jobs — the page must still render
      // even though the SSE consumer cannot mount.
      await signInPage(page, ctx, cast.active);
      await page.goto('/jobs');
      await page.waitForLoadState('load');
      await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible();

      // Own-mutation path (MVP-FIX-A) must continue to work without SSE.
      // Seed an open job, then enroll from this page; the UI swaps to
      // UnenrollButton via router.refresh() (NOT via SSE).
      await reAuth(page, ctx, cast.alumni);
      const jobId = await postJob(page, `Degrade test — ${suffix}`);
      await approveAsMod(page, ctx, cast.mod, pool, jobId);
      await enrollAsActive(page, ctx, cast.active, pool, jobId);
      await page.goto(`/jobs/${jobId}`);
      await page.waitForLoadState('load');
      await expect(page.getByTestId('unenroll-button')).toBeVisible();
    } finally {
      await page.close();
      await ctx.close();
      await pool.end();
    }
  });

  // AC-05: Privacy — raw SSE stream payload contains only IDs / metadata,
  // never description / contact / dues / Active names.
  test('AC-05: raw SSE stream contains only IDs (no PII or content)', async ({
    browser,
    baseURL,
  }) => {
    const pool = createPool();
    const ctxClient = await browser.newContext();
    const ctxMutator = await browser.newContext();
    const pageClient = await ctxClient.newPage();
    const pageMut = await ctxMutator.newPage();
    installPageerrorListener(pageClient);
    installPageerrorListener(pageMut);

    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);
      const description = `PRIVATE-PII-${suffix}`;
      const contactValue = `private-contact-${suffix}@chapter.invalid`;
      const location = `PRIVATE-LOCATION-${suffix}`;

      // Sign in as the listening user, then read the cookies out so we can
      // hit /api/events/chapter directly with a raw fetch.
      await signInPage(pageClient, ctxClient, cast.active);
      const cookies = await ctxClient.cookies();
      const cookieHeader = cookies
        .map((c) => `${c.name}=${c.value}`)
        .join('; ');

      // Start the SSE stream via fetch (with the abort signal under our
      // control) BEFORE mutating, so the event lands while we're listening.
      const controller = new AbortController();
      const fetchUrl = `${baseURL ?? 'http://localhost:3000'}/api/events/chapter`;
      const streamPromise = fetch(fetchUrl, {
        method: 'GET',
        headers: { Cookie: cookieHeader, Accept: 'text/event-stream' },
        signal: controller.signal,
      });

      // Allow the route handler to register its subscription before publish.
      // 250ms is plenty for a local dev server.
      await new Promise((r) => setTimeout(r, 250));

      // Mutator session posts a job with deliberately unique tokens in
      // every PII-eligible field so a `String.includes` check is definitive.
      await signInPage(pageMut, ctxMutator, cast.alumni);
      await pageMut.goto('/jobs/new');
      await pageMut.waitForLoadState('load');
      await pageMut.getByPlaceholder(/Describe the job/i).fill(description);
      await pageMut.locator('input[name="duesAmount"]').fill('77');
      await pageMut.locator('input[name="recommendedPeopleCount"]').fill('1');
      await pageMut.getByTestId('post-job-location').fill(location);
      await pageMut.getByTestId('post-job-duration').fill('1');
      // Force the contact value (default is the Alumni's account email).
      await pageMut.getByTestId('post-job-contact-value').fill(contactValue);
      const submit = pageMut.getByRole('button', { name: /Post job/i });
      await expect(submit).toBeEnabled({ timeout: 30_000 });
      await submit.click();
      await pageMut.waitForURL(/\/jobs\/[0-9a-f-]+$/, { timeout: 15_000 });

      // Drain a chunk of the SSE stream long enough to capture the event.
      const res = await streamPromise;
      expect(res.status).toBe(200);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        if (acc.includes('event: job.posted')) break;
      }
      controller.abort();

      // The frame for the new job was received — and it contains zero PII.
      expect(acc).toContain('event: job.posted');
      expect(acc).not.toContain(description);
      expect(acc).not.toContain(contactValue);
      expect(acc).not.toContain(location);
      expect(acc).not.toMatch(/"dues_amount"/);
      expect(acc).not.toMatch(/"description"/);
    } finally {
      await pageClient.close();
      await pageMut.close();
      await ctxClient.close();
      await ctxMutator.close();
      await pool.end();
    }
  });

  // AC-06: Auth gate — /api/events/chapter rejects anonymous requests with
  // 401 before opening any stream.
  test('AC-06: /api/events/chapter is 401 for anonymous requests', async ({
    request,
  }) => {
    const res = await request.get('/api/events/chapter');
    expect(res.status()).toBe(401);
    expect(res.headers()['content-type'] ?? '').not.toMatch(/event-stream/);
  });
});

// Use `pollJobState` to keep imports honest — referenced from approveAsMod
// internally; this no-op ensures eslint-plugin-import does not flag it.
void pollJobState;
