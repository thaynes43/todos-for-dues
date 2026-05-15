import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BOOTSTRAP_ENV_TO_GUC = [
  ['BOOTSTRAP_ADMIN_RECIPIENT_EMAIL', 'app.bootstrap_admin_recipient_email'],
  ['BOOTSTRAP_TREASURER_RECIPIENT_EMAIL', 'app.bootstrap_treasurer_recipient_email'],
  ['BOOTSTRAP_MODERATORS_RECIPIENT_EMAIL', 'app.bootstrap_moderators_recipient_email'],
  ['BOOTSTRAP_CHAPTER_TIMEZONE', 'app.bootstrap_chapter_timezone'],
  ['BOOTSTRAP_CHAPTER_DISPLAY_NAME', 'app.bootstrap_chapter_display_name'],
] as const;

export const DEFAULT_MIGRATIONS_FOLDER = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
);

export interface RunMigrationsOptions {
  databaseUrl: string;
  migrationsFolder?: string;
  env?: NodeJS.ProcessEnv;
}

export async function runMigrations(options: RunMigrationsOptions): Promise<void> {
  const env = options.env ?? process.env;
  const migrationsFolder = options.migrationsFolder ?? DEFAULT_MIGRATIONS_FOLDER;
  const client = new Client({ connectionString: options.databaseUrl });
  await client.connect();
  try {
    for (const [envKey, gucKey] of BOOTSTRAP_ENV_TO_GUC) {
      const value = env[envKey];
      if (value !== undefined) {
        await client.query({
          text: 'SELECT set_config($1, $2, false)',
          values: [gucKey, value],
        });
      }
    }
    const db = drizzle(client);
    await migrate(db, { migrationsFolder });
  } finally {
    await client.end();
  }
}
