import { db as defaultDb } from '@app/db';
import { chapterSettings } from '@app/db/schema';
import { eq } from 'drizzle-orm';

export class MissingSettingError extends Error {
  override readonly name = 'MissingSettingError';
  constructor(public readonly key: string) {
    super(
      `Setting "${key}" is missing: no chapter_settings row and no BOOTSTRAP_${envKey(key)} env var.`,
    );
  }
}

function envKey(key: string): string {
  return key.toUpperCase();
}

type DbLike = Pick<typeof defaultDb, 'select'>;

interface GetSettingOptions {
  /** Override the DB handle. Used in tests. */
  db?: DbLike;
  /** Override the env source. Used in tests. */
  env?: Record<string, string | undefined>;
}

/**
 * Look up a per-instance setting per ADR-010. DB row wins; env-var fallback
 * (`BOOTSTRAP_<KEY_UPPER>`) covers fresh-boot before bootstrap-migration seeds.
 * Throws `MissingSettingError` when both are absent — callers in MVP either
 * have the bootstrap migration's defaults or a real env var available.
 */
export async function getSetting<T>(
  key: string,
  options: GetSettingOptions = {},
): Promise<T> {
  const db = options.db ?? defaultDb;
  const env = options.env ?? process.env;

  const rows = await db
    .select({ value: chapterSettings.value })
    .from(chapterSettings)
    .where(eq(chapterSettings.key, key));
  if (rows.length > 0) {
    return rows[0]!.value as T;
  }

  const fallback = env[`BOOTSTRAP_${envKey(key)}`];
  if (fallback !== undefined) {
    return fallback as T;
  }

  throw new MissingSettingError(key);
}

/**
 * Like {@link getSetting} but returns the supplied default when both DB and
 * env are empty. Use for non-critical settings; for required keys prefer
 * `getSetting` so misconfiguration surfaces loudly.
 */
export async function getSettingOrDefault<T>(
  key: string,
  fallback: T,
  options: GetSettingOptions = {},
): Promise<T> {
  try {
    return await getSetting<T>(key, options);
  } catch (err) {
    if (err instanceof MissingSettingError) return fallback;
    throw err;
  }
}
