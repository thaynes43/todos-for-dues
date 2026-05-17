import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isRedirectError } from './_next-shims';
import {
  countUsers,
  getAccountRows,
  getUserIdByEmail,
  getUserRoleByEmail,
  insertAdminBootstrap,
  insertInviteToken,
  startAuthTestDb,
  truncateAll,
  type AuthTestDb,
} from './_db';

type SignupActionFailure = { ok: false; error: string; field?: string };
type SignupActionSuccess = { ok: true };
type SignupActionResultLocal = SignupActionSuccess | SignupActionFailure;
type SignupActionFn = (
  prev: SignupActionResultLocal | undefined,
  formData: FormData,
) => Promise<SignupActionResultLocal>;

let testDb: AuthTestDb;
let adminId: string;
let auth: typeof import('../../src/config').auth;
let signupWithInviteToken: SignupActionFn;

beforeAll(async () => {
  testDb = await startAuthTestDb();
  // Import after DATABASE_URL is set so the lazy @app/db proxy connects to the
  // testcontainer. Use a dynamic import to defer module-graph evaluation.
  ({ auth } = await import('../../src/config'));
  // Pull the signup server action across the package boundary to exercise the
  // revoke-first atomicity fix (PRD-003 R-14 / PLAN-014 §7 Risk 1 strategy a).
  // The action imports `next/navigation`; vitest.config.ts aliases that module
  // to a local shim so we don't pull all of next into @app/auth. The type is
  // declared locally (not via `typeof import(...)`) because typechecking the
  // action file from this package would pull in transitive types (`next`,
  // drizzle-orm via apps/web's resolution path) that aren't reachable from
  // here. The runtime import resolves fine because Vitest's resolver walks
  // the workspace.
  const actionsUrl = new URL(
    '../../../../apps/web/app/signup/actions.ts',
    import.meta.url,
  );
  const actionsSpecifier = fileURLToPath(actionsUrl);
  const actionsModule = (await import(actionsSpecifier)) as {
    signupWithInviteToken: SignupActionFn;
  };
  signupWithInviteToken = actionsModule.signupWithInviteToken;
  adminId = await insertAdminBootstrap(testDb.pool);
}, 180_000);

afterAll(async () => {
  await testDb?.stop();
});

beforeEach(async () => {
  await truncateAll(testDb.pool);
  adminId = await insertAdminBootstrap(testDb.pool);
});

describe('invite-token signup happy path (PRD-003 R-01/AC-01)', () => {
  it('creates user with role from token + account row with credential provider', async () => {
    await insertInviteToken(testDb.pool, {
      token: 'happy-active',
      preselectedRole: 'Active',
      createdBy: adminId,
    });

    await auth.api.signUpEmail({
      body: {
        email: 'newbie@chapter.test',
        password: 'correct-horse-battery',
        name: 'Newbie Active',
        role: 'Active',
      } as never,
    });

    expect(await getUserRoleByEmail(testDb.pool, 'newbie@chapter.test')).toBe('Active');
    const userId = await getUserIdByEmail(testDb.pool, 'newbie@chapter.test');
    expect(userId).not.toBeNull();
    const accounts = await getAccountRows(testDb.pool, userId!);
    expect(accounts).toEqual([
      { providerId: 'credential', accountId: userId, hasPassword: true },
    ]);
  });

  it('writes role=Alumni when the invite token preselectedRole is Alumni', async () => {
    await insertInviteToken(testDb.pool, {
      token: 'happy-alumni',
      preselectedRole: 'Alumni',
      createdBy: adminId,
    });

    await auth.api.signUpEmail({
      body: {
        email: 'graduate@chapter.test',
        password: 'correct-horse-battery',
        name: 'Graduate',
        role: 'Alumni',
      } as never,
    });

    expect(await getUserRoleByEmail(testDb.pool, 'graduate@chapter.test')).toBe('Alumni');
  });

  it('does NOT write a user_role_transitions row at signup (Trap 2)', async () => {
    await insertInviteToken(testDb.pool, {
      token: 'no-audit',
      preselectedRole: 'Active',
      createdBy: adminId,
    });

    await auth.api.signUpEmail({
      body: {
        email: 'first-time@chapter.test',
        password: 'correct-horse-battery',
        name: 'First Time',
        role: 'Active',
      } as never,
    });

    const userId = await getUserIdByEmail(testDb.pool, 'first-time@chapter.test');
    const { rows } = await testDb.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM user_role_transitions WHERE user_id = $1`,
      [userId],
    );
    expect(rows[0]?.count).toBe('0');
  });
});

/**
 * Helpers for exercising the signup server action. The action calls
 * `redirect('/')` on success, which throws a NEXT_REDIRECT-tagged error in
 * non-request environments. We swallow that throw so the rest of the test
 * can assert DB state.
 */
function makeFormData(input: {
  token: string;
  email: string;
  password: string;
  displayName: string;
}): FormData {
  const fd = new FormData();
  fd.set('token', input.token);
  fd.set('email', input.email);
  fd.set('password', input.password);
  fd.set('displayName', input.displayName);
  return fd;
}

type SignupResult =
  | { kind: 'ok' }
  | { kind: 'error'; error: string; field?: string };

async function runSignupAction(input: {
  token: string;
  email: string;
  password: string;
  displayName: string;
}): Promise<SignupResult> {
  try {
    const result = await signupWithInviteToken(undefined, makeFormData(input));
    if (result?.ok === true) return { kind: 'ok' };
    if (result && result.ok === false) {
      return { kind: 'error', error: result.error, field: result.field };
    }
    // Action returned void (shouldn't happen if redirect fired) — treat as ok.
    return { kind: 'ok' };
  } catch (err) {
    if (isRedirectError(err)) return { kind: 'ok' };
    throw err;
  }
}

async function countTokenRows(token: string): Promise<{
  total: number;
  revoked: number;
}> {
  const { rows } = await testDb.pool.query<{ total: string; revoked: string }>(
    `SELECT COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE revoked_at IS NOT NULL)::text AS revoked
       FROM invite_tokens WHERE token = $1`,
    [token],
  );
  return {
    total: Number(rows[0]?.total ?? 0),
    revoked: Number(rows[0]?.revoked ?? 0),
  };
}

describe('invite-token single-use redemption (PRD-003 AC-13 / R-14)', () => {
  it('second redemption of the same token returns the revoked error and creates no second user', async () => {
    await insertInviteToken(testDb.pool, {
      token: 'single-use-token',
      preselectedRole: 'Active',
      createdBy: adminId,
    });

    const first = await runSignupAction({
      token: 'single-use-token',
      email: 'first-claimer@chapter.test',
      password: 'correct-horse-battery',
      displayName: 'First Claimer',
    });
    expect(first).toEqual({ kind: 'ok' });
    expect(await getUserRoleByEmail(testDb.pool, 'first-claimer@chapter.test')).toBe(
      'Active',
    );

    const second = await runSignupAction({
      token: 'single-use-token',
      email: 'second-claimer@chapter.test',
      password: 'correct-horse-battery',
      displayName: 'Second Claimer',
    });
    expect(second).toEqual({
      kind: 'error',
      error: 'Invite link is invalid or has been revoked.',
      field: 'token',
    });

    // No second user created.
    expect(await countUsers(testDb.pool, 'second-claimer@chapter.test')).toBe(0);

    // Exactly one row for this token, and it is revoked.
    const tokenState = await countTokenRows('single-use-token');
    expect(tokenState).toEqual({ total: 1, revoked: 1 });
  });
});

describe('invite-token concurrent redemption race (VALIDATION-014 §6 R-14)', () => {
  it('two concurrent redemptions of the same token: exactly one user created, exactly one revoke', async () => {
    await insertInviteToken(testDb.pool, {
      token: 'race-token',
      preselectedRole: 'Active',
      createdBy: adminId,
    });

    // Distinct emails so the unique-email constraint can't mask the race.
    const [resultA, resultB] = await Promise.all([
      runSignupAction({
        token: 'race-token',
        email: 'race-a@chapter.test',
        password: 'correct-horse-battery',
        displayName: 'Race Contestant A',
      }),
      runSignupAction({
        token: 'race-token',
        email: 'race-b@chapter.test',
        password: 'correct-horse-battery',
        displayName: 'Race Contestant B',
      }),
    ]);

    const outcomes = [resultA, resultB];
    const successes = outcomes.filter((r) => r.kind === 'ok');
    const failures = outcomes.filter((r) => r.kind === 'error');

    // Exactly one succeeded, exactly one got the revoked error.
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toEqual({
      kind: 'error',
      error: 'Invite link is invalid or has been revoked.',
      field: 'token',
    });

    // Exactly one new user across both candidate emails.
    const usersCreated =
      (await countUsers(testDb.pool, 'race-a@chapter.test')) +
      (await countUsers(testDb.pool, 'race-b@chapter.test'));
    expect(usersCreated).toBe(1);

    // Exactly one row for the token, with revoked_at set.
    const tokenState = await countTokenRows('race-token');
    expect(tokenState).toEqual({ total: 1, revoked: 1 });
  });
});
