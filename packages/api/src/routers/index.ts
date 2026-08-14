import { router } from '../trpc';
import { jobsRouter } from './jobs';
import { usersRouter } from './users';
import { settingsRouter } from './settings';
import { adminRouter } from './admin';
import { memberStatusRouter } from './member-status';

// Re-exported so consumers (and TS declaration inference for server-side
// callers) can name the router's types via a portable specifier.
export { memberStatusRouter, type MemberStatusState } from './member-status';

export const appRouter = router({
  jobs: jobsRouter,
  users: usersRouter,
  settings: settingsRouter,
  admin: adminRouter,
  memberStatus: memberStatusRouter,
});

export type AppRouter = typeof appRouter;
