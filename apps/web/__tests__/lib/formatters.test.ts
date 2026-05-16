import { describe, it, expect } from 'vitest';
import { JOB_STATES, type JobState } from '@app/db/schema';
import { stateDisplayName, formatChapterLocal } from '@/lib/formatters';

describe('stateDisplayName', () => {
  const cases: Array<[JobState, string]> = [
    ['awaiting_moderation', 'awaiting moderation'],
    ['approved', 'approved'],
    ['enrollment_open', 'enrollment-open'],
    ['locked', 'locked'],
    ['completed', 'completed'],
    ['payment_sent', 'payment-sent'],
    ['closed', 'closed'],
    ['disputed', 'disputed'],
    ['rejected', 'rejected'],
    ['cancelled', 'cancelled'],
  ];

  for (const [state, expected] of cases) {
    it(`${state} → "${expected}"`, () => {
      expect(stateDisplayName(state)).toBe(expected);
    });
  }

  it('covers every JobState in the enum', () => {
    for (const s of JOB_STATES) {
      expect(typeof stateDisplayName(s)).toBe('string');
      expect(stateDisplayName(s).length).toBeGreaterThan(0);
    }
  });
});

describe('formatChapterLocal', () => {
  it('formats UTC ISO into chapter-local string for the configured timezone', () => {
    const iso = '2026-07-04T16:00:00.000Z';
    const formatted = formatChapterLocal(iso, 'America/New_York');
    expect(formatted).toContain('2026');
    expect(formatted).toContain('Jul');
    // EDT (UTC-4) → 12:00 PM
    expect(formatted).toMatch(/12:00/);
  });

  it('returns empty string for null/undefined', () => {
    expect(formatChapterLocal(null)).toBe('');
    expect(formatChapterLocal(undefined)).toBe('');
  });

  it('returns empty string for unparseable input', () => {
    expect(formatChapterLocal('not-a-date')).toBe('');
  });

  it('honours the timezone argument', () => {
    const iso = '2026-07-04T16:00:00.000Z';
    const ny = formatChapterLocal(iso, 'America/New_York');
    const utc = formatChapterLocal(iso, 'UTC');
    expect(ny).not.toBe(utc);
  });
});
