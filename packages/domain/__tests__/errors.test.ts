import { describe, expect, it } from 'vitest';
import { findPostgresCheckViolation } from '../src/errors';

// drizzle-orm ≥0.44 wraps driver errors in DrizzleQueryError with the pg
// DatabaseError as `cause` (a DEFERRABLE trigger firing at COMMIT surfaces
// as `Failed query: commit`). The min-Admin mapping must see through that.
describe('findPostgresCheckViolation', () => {
  const pgError = Object.assign(
    new Error('min-Admin invariant violated: chapter must have at least one Admin'),
    { code: '23514' },
  );

  it('finds a bare pg CHECK violation (drizzle <0.44 shape)', () => {
    expect(findPostgresCheckViolation(pgError)?.message).toContain('min-Admin');
  });

  it('finds the violation behind a DrizzleQueryError-style cause chain', () => {
    const wrapped = new Error('Failed query: commit');
    (wrapped as Error & { cause?: unknown }).cause = pgError;
    expect(findPostgresCheckViolation(wrapped)?.message).toContain('min-Admin');
  });

  it('walks multi-level cause chains', () => {
    const inner = new Error('Failed query: commit');
    (inner as Error & { cause?: unknown }).cause = pgError;
    const outer = new Error('outer wrapper');
    (outer as Error & { cause?: unknown }).cause = inner;
    expect(findPostgresCheckViolation(outer)?.code).toBe('23514');
  });

  it('returns null when no CHECK violation exists in the chain', () => {
    expect(findPostgresCheckViolation(new Error('unrelated'))).toBeNull();
    expect(findPostgresCheckViolation(undefined)).toBeNull();
    expect(findPostgresCheckViolation('string error')).toBeNull();
  });

  it('survives circular cause chains', () => {
    const a = new Error('a');
    const b = new Error('b');
    (a as Error & { cause?: unknown }).cause = b;
    (b as Error & { cause?: unknown }).cause = a;
    expect(findPostgresCheckViolation(a)).toBeNull();
  });
});
