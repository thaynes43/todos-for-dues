import { router } from '../trpc';
import { jobsRouter } from './jobs';
import { usersRouter } from './users';
import { settingsRouter } from './settings';
import { adminRouter } from './admin';
import { memberStatusRouter } from './member-status';

export const appRouter = router({
  jobs: jobsRouter,
  users: usersRouter,
  settings: settingsRouter,
  admin: adminRouter,
  memberStatus: memberStatusRouter,
});

export type AppRouter = typeof appRouter;
