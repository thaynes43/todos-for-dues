import { router } from '../trpc';
import { jobsRouter } from './jobs';
import { usersRouter } from './users';
import { settingsRouter } from './settings';
import { adminRouter } from './admin';
import { invitesRouter } from './invites';

export const appRouter = router({
  jobs: jobsRouter,
  users: usersRouter,
  settings: settingsRouter,
  admin: adminRouter,
  invites: invitesRouter,
});

export type AppRouter = typeof appRouter;
