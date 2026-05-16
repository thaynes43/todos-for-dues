import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { OidcMockServer } from './oidc-mock-server';

const TMP_DIR = join(process.cwd(), '.playwright-tmp');

interface GlobalState {
  pg?: StartedPostgreSqlContainer;
  oidc?: OidcMockServer;
  dev?: ChildProcess;
}

async function killDev(dev: ChildProcess): Promise<void> {
  if (dev.exitCode !== null || dev.signalCode !== null) return;
  return new Promise<void>((resolve) => {
    const done = (): void => resolve();
    dev.once('exit', done);
    try {
      dev.kill('SIGTERM');
    } catch {
      // already gone
      resolve();
      return;
    }
    setTimeout(() => {
      try {
        dev.kill('SIGKILL');
      } catch {
        // ignore
      }
    }, 5_000);
  });
}

export default async function globalTeardown(): Promise<void> {
  const state =
    (globalThis as unknown as { __PLAYWRIGHT_E2E_STATE__?: GlobalState })
      .__PLAYWRIGHT_E2E_STATE__ ?? {};

  // Order: dev server first (frees port 3000), then OIDC, then PG.
  try {
    if (state.dev) await killDev(state.dev);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[e2e] dev server teardown failed', err);
  }

  try {
    await state.oidc?.stop();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[e2e] OIDC mock teardown failed', err);
  }

  try {
    await state.pg?.stop();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[e2e] postgres teardown failed', err);
  }

  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
}
