import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Repo root: walk up from this file (packages/domain/__tests__) two levels.
 */
const REPO_ROOT = join(__dirname, '..', '..', '..');

const ALLOWED_DIR_PREFIX = `packages${sep}domain${sep}`;

/**
 * Pre-PLAN-003 schema/constraint tests that exercise the DB-level invariants
 * directly (the min-Admin trigger, the audit-log table's NOT NULL CHECKs,
 * idempotency keys). These tests intentionally bypass the FSM helpers because
 * they're validating the schema, not the FSM. New code should not add to this
 * list — route through `@app/domain` instead.
 */
const ALLOWED_FILES = new Set<string>([
  'packages/db/__tests__/constraints.test.ts',
  'packages/db/__tests__/idempotency.test.ts',
  'packages/db/__tests__/min-admin-invariant.test.ts',
]);

const FORBIDDEN_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'UPDATE jobs SET state', regex: /UPDATE\s+jobs\s+SET\s+state\b/i },
  { name: 'UPDATE users SET role', regex: /UPDATE\s+users\s+SET\s+role\b/i },
  {
    name: 'INSERT INTO job_state_transitions',
    regex: /INSERT\s+INTO\s+job_state_transitions\b/i,
  },
  {
    name: 'INSERT INTO user_role_transitions',
    regex: /INSERT\s+INTO\s+user_role_transitions\b/i,
  },
];

const IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  '.next',
  '.git',
  'coverage',
  'migrations', // raw SQL migration scripts in packages/db/migrations are the schema source of truth
  'playwright-report',
  'test-results',
  '.playwright-mcp',
  '.agents',
]);

const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile()) {
      const ext = entry.name.slice(entry.name.lastIndexOf('.'));
      if (ALLOWED_EXTENSIONS.has(ext)) {
        files.push(full);
      }
    }
  }
  return files;
}

describe('static analysis — single-writer invariant for state + audit-log tables', () => {
  it('no UPDATE jobs SET state / UPDATE users SET role / INSERT INTO {job_state_transitions, user_role_transitions} outside packages/domain/', async () => {
    // Sanity: REPO_ROOT must look like the repo root.
    const stats = await stat(join(REPO_ROOT, 'pnpm-workspace.yaml'));
    expect(stats.isFile()).toBe(true);

    const files = await walk(REPO_ROOT);
    const violations: Array<{ file: string; pattern: string; line: number }> = [];

    for (const absPath of files) {
      const relPath = relative(REPO_ROOT, absPath);
      if (relPath.startsWith(ALLOWED_DIR_PREFIX)) continue;
      const relWithSlashes = relPath.split(sep).join('/');
      if (ALLOWED_FILES.has(relWithSlashes)) continue;

      const content = await readFile(absPath, 'utf8');
      const lines = content.split('\n');
      for (const { name, regex } of FORBIDDEN_PATTERNS) {
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i]!)) {
            violations.push({ file: relWithSlashes, pattern: name, line: i + 1 });
          }
        }
      }
    }

    if (violations.length > 0) {
      const detail = violations
        .map((v) => `  ${v.file}:${v.line}  →  ${v.pattern}`)
        .join('\n');
      throw new Error(
        `Found ${violations.length} direct state/audit-log write(s) outside packages/domain/.\n` +
          `These mutations must go through @app/domain (transitionJob, transitionRole, recordRelationshipEvent).\n` +
          detail,
      );
    }
  });
});
