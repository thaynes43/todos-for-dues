import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startPortalApiMock, type PortalApiMock } from './_portal-mock';

/**
 * VALIDATION (ADR-015 / sigo-alumni backlog 07 ruling) — adversarial gap
 * coverage for the status⊥role orthogonality invariant, added on branch
 * `validation-orthogonality` (stacked on `fix-status-role-orthogonality`).
 *
 * These pin behaviours the PR's own suite left implicit. Every case runs
 * against the REAL stack (PG16 testcontainer + the real tRPC caller + the real
 * min-Admin trigger); status gates are exercised through the actual
 * `claimProcedure` / `postProcedure` middleware, never mocked.
 *
 *  §1  ACCESS GATE — the incident state at the SERVER boundary. A caller whose
 *      fresh portal status is `no-registry-row` (the owner's exact 409 state),
 *      `undeclared`, or `unavailable` (portal down) is FORBIDDEN from BOTH
 *      post AND claim/enroll via a direct tRPC call — UI-hidden is not the only
 *      guard. The Admin-with-no-registry-row twin proves the role is untouched
 *      and zero `user_role_transitions` rows are written (the incident, server
 *      side).
 *  §2  PRIVILEGED ROLE GATES BY ITS OWN STATUS — both directions. An Admin /
 *      Moderator with status `active` CAN enroll and CANNOT post; with status
 *      `alumni` CAN post and CANNOT enroll. Role never grants a board
 *      capability; status alone does. Role byte-identical, zero role rows.
 *  §3  PRIVILEGED WALKING SKELETON — the whole point of orthogonality end to
 *      end: an Admin (status alumni) posts, a Moderator (status active)
 *      enrolls, the job is driven to `closed`. Both privileged actors get their
 *      board capability from STATUS; their roles never move and no role
 *      transition is written across the entire loop.
 *  §4  ADMIN REPEATED FLIPS — the incident actor, real portal PUT path. Six
 *      `memberStatus.set` flips keep the role pill frozen at Admin and the
 *      `user_role_transitions` table byte-stable (zero rows).
 *
 * Env ordering: `@app/auth` reads OIDC_* at module load, so `_setup` is
 * imported dynamically after the portal mock is up (member-status.test.ts
 * pattern).
 */

type Setup = typeof import('./_setup');
type TestDb = Awaited<ReturnType<Setup['startTestDb']>>;
type SeedUsers = Awaited<ReturnType<Setup['resetAndSeedUsers']>>;

let portal: PortalApiMock;
let setup: Setup;
let testDb: TestDb;
let seeded: SeedUsers;

beforeAll(async () => {
  portal = await startPortalApiMock();
  process.env.OIDC_CLIENT_ID = 'todos-for-dues';
  process.env.OIDC_CLIENT_SECRET = 'test-portal-client-secret';
  process.env.OIDC_DISCOVERY_URL = portal.discoveryUrl;
  setup = await import('./_setup');
  testDb = await setup.startTestDb();
}, 180_000);

afterAll(async () => {
  await testDb?.stop();
  await portal?.stop();
});

beforeEach(async () => {
  seeded = await setup.resetAndSeedUsers(testDb.pool);
  portal.tokens.clear();
  portal.refreshTokens.clear();
  portal.registry.clear();
  portal.mode = 'on';
  portal.refreshCount = 0;
});

async function roleTransitions(userId: string): Promise<number> {
  const { rows } = await testDb.pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM user_role_transitions WHERE user_id = $1`,
    [userId],
  );
  return Number(rows[0]!.n);
}

/** A future ISO datetime for lock(). */
const FUTURE = () => new Date(Date.now() + 7 * 86_400_000).toISOString();

const POST_INPUT = {
  description: 'Rake the leaves',
  duesAmount: 30,
  recommendedPeopleCount: 1,
  posterContactKind: 'email' as const,
  posterContactValue: 'poster@example.com',
  location: 'Chapter house',
  estimatedDurationHours: 1.5,
};

// ── §1 — access gate: the incident state at the server boundary ──────────────
describe('§1 non-declared status is FORBIDDEN from post AND claim at the tRPC layer (ADR-015)', () => {
  // The three gate values that must behave exactly like the owner's incident
  // state: neither post nor claim, server-side.
  for (const status of ['no-registry-row', 'undeclared', 'unavailable'] as const) {
    it(`status '${status}' → post, enroll, listMyPosted, listMyEnrolled all FORBIDDEN`, async () => {
      const jobId = await setup.insertJob(testDb.pool, {
        posterId: seeded.alumni,
        state: 'enrollment_open',
      });
      const c = setup.caller(
        setup.makeCtx({ userId: seeded.active1, role: 'Member', status }),
      );

      await expect(c.jobs.post(POST_INPUT)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(c.jobs.enroll({ jobId })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(c.jobs.listMyPosted()).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(c.jobs.listMyEnrolled()).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  }

  it('OWNER INCIDENT TWIN (server side): Admin + no-registry-row cannot post/enroll; role stays Admin, zero role transitions', async () => {
    const jobId = await setup.insertJob(testDb.pool, {
      posterId: seeded.alumni,
      state: 'enrollment_open',
    });
    // The exact incident identity: an Admin whose portal call returns 409
    // (no linked registry row). Reaching the board actions directly must fail,
    // and — the crux of the Sev-1 — must not disturb their role.
    const c = setup.caller(
      setup.makeCtx({
        userId: seeded.admin,
        role: 'Admin',
        status: 'no-registry-row',
      }),
    );

    await expect(c.jobs.post(POST_INPUT)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(c.jobs.enroll({ jobId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    expect(await setup.getUserRole(testDb.pool, seeded.admin)).toBe('Admin');
    expect(await roleTransitions(seeded.admin)).toBe(0);
  });
});

// ── §2 — privileged role gates on its OWN status, both directions ────────────
describe('§2 privileged roles get board capabilities from STATUS, never role (ADR-015)', () => {
  it('Admin & Moderator with status active CAN enroll; role byte-identical, zero role rows', async () => {
    for (const [userId, role] of [
      [seeded.admin, 'Admin'],
      [seeded.moderator, 'Moderator'],
    ] as const) {
      const jobId = await setup.insertJob(testDb.pool, {
        posterId: seeded.alumni,
        state: 'enrollment_open',
      });
      const c = setup.caller(
        setup.makeCtx({ userId, role, status: 'active' }),
      );
      await c.jobs.enroll({ jobId });

      const { rows } = await testDb.pool.query(
        `SELECT 1 FROM job_enrollments WHERE job_id = $1 AND active_id = $2`,
        [jobId, userId],
      );
      expect(rows).toHaveLength(1);
      expect(await setup.getUserRole(testDb.pool, userId)).toBe(role);
      expect(await roleTransitions(userId)).toBe(0);
    }
  });

  it('Admin & Moderator with status alumni are FORBIDDEN from enroll (role does not bypass the status gate)', async () => {
    for (const [userId, role] of [
      [seeded.admin, 'Admin'],
      [seeded.moderator, 'Moderator'],
    ] as const) {
      const jobId = await setup.insertJob(testDb.pool, {
        posterId: seeded.alumni,
        state: 'enrollment_open',
      });
      const c = setup.caller(
        setup.makeCtx({ userId, role, status: 'alumni' }),
      );
      await expect(c.jobs.enroll({ jobId })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(await setup.getUserRole(testDb.pool, userId)).toBe(role);
      expect(await roleTransitions(userId)).toBe(0);
    }
  });

  it('Admin & Moderator with status alumni CAN post; with status active CANNOT', async () => {
    for (const [userId, role] of [
      [seeded.admin, 'Admin'],
      [seeded.moderator, 'Moderator'],
    ] as const) {
      const alumniCtx = setup.caller(
        setup.makeCtx({ userId, role, status: 'alumni' }),
      );
      const { jobId } = await alumniCtx.jobs.post(POST_INPUT);
      expect(await setup.getJobState(testDb.pool, jobId)).toBe(
        'awaiting_moderation',
      );

      const activeCtx = setup.caller(
        setup.makeCtx({ userId, role, status: 'active' }),
      );
      await expect(activeCtx.jobs.post(POST_INPUT)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });

      expect(await setup.getUserRole(testDb.pool, userId)).toBe(role);
      expect(await roleTransitions(userId)).toBe(0);
    }
  });
});

// ── §3 — privileged walking skeleton (orthogonality end to end) ──────────────
describe('§3 privileged walking skeleton — Admin(alumni) posts, Moderator(active) enrolls, drive to closed (ADR-015)', () => {
  it('runs the full loop on status alone; both privileged roles never move; zero role transitions', async () => {
    // Admin acts as the alumni-side poster (capability from status=alumni, not
    // from being Admin) and, as a privileged role, self-approves + drives the
    // poster legs. Moderator acts as the active-side enroller (capability from
    // status=active, not from being Moderator).
    const adminAlumni = setup.caller(
      setup.makeCtx({ userId: seeded.admin, role: 'Admin', status: 'alumni' }),
    );
    const modActive = setup.caller(
      setup.makeCtx({
        userId: seeded.moderator,
        role: 'Moderator',
        status: 'active',
      }),
    );

    // Post (status alumni) → self-approve (role Admin) → enroll (status active)
    const { jobId } = await adminAlumni.jobs.post(POST_INPUT);
    await adminAlumni.jobs.approve({ jobId });
    expect(await setup.getJobState(testDb.pool, jobId)).toBe('enrollment_open');

    await modActive.jobs.enroll({ jobId });

    // Lock → complete → payment_sent → confirm (Moderator, enrolled) → closed
    await adminAlumni.jobs.lock({ jobId, workDate: FUTURE() });
    await adminAlumni.jobs.complete({
      jobId,
      confirmedAttendees: [seeded.moderator],
    });
    await adminAlumni.jobs.markPaymentSent({ jobId });
    const receipt = await modActive.jobs.confirmReceipt({ jobId });

    expect(receipt.state).toBe('closed');
    expect(await setup.getJobState(testDb.pool, jobId)).toBe('closed');

    // The whole loop turned on STATUS; neither privileged role moved, and not
    // one role transition was written for either actor.
    expect(await setup.getUserRole(testDb.pool, seeded.admin)).toBe('Admin');
    expect(await setup.getUserRole(testDb.pool, seeded.moderator)).toBe(
      'Moderator',
    );
    expect(await roleTransitions(seeded.admin)).toBe(0);
    expect(await roleTransitions(seeded.moderator)).toBe(0);
  });
});

// ── §4 — the incident actor: repeated real portal flips ──────────────────────
describe('§4 an Admin flipping status repeatedly keeps role frozen at Admin (ADR-015)', () => {
  async function linkPortalAccount(userId: string): Promise<void> {
    const accessToken = `at-${userId}`;
    await testDb.pool.query(
      `INSERT INTO "account" (user_id, provider_id, account_id, access_token, refresh_token, access_token_expires_at)
       VALUES ($1::uuid, 'sigo-portal', $1::uuid::text, $2, $3, $4)`,
      [userId, accessToken, `rt-${userId}`, new Date(Date.now() + 60 * 60_000)],
    );
    portal.tokens.set(accessToken, userId);
    portal.refreshTokens.set(`rt-${userId}`, userId);
  }

  it('six memberStatus.set flips move the registry only; role stays Admin, zero role transitions', async () => {
    await linkPortalAccount(seeded.admin);
    portal.registry.set(seeded.admin, 'active');
    const c = setup.caller(
      setup.makeCtx({ userId: seeded.admin, role: 'Admin' }),
    );

    const legs = ['alumni', 'active', 'alumni', 'active', 'alumni', 'active'] as const;
    for (const status of legs) {
      const result = await c.memberStatus.set({ status });
      expect(result).toEqual({ kind: 'ok', status });
      expect(portal.registry.get(seeded.admin)).toBe(status);
      // The incident was an Admin flipping status — the role must never budge.
      expect(await setup.getUserRole(testDb.pool, seeded.admin)).toBe('Admin');
    }

    // Byte-stable transitions table: not one role row across six flips.
    expect(await roleTransitions(seeded.admin)).toBe(0);
  });
});
