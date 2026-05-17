import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AggregateCountsCards } from '@/components/AggregateCountsCards';
import { JOB_STATES, type JobState } from '@app/db/schema';
import { stateDisplayName } from '@/lib/formatters';

function makeCounts(overrides: Partial<Record<JobState, number>> = {}) {
  const base = {} as Record<JobState, number>;
  for (const s of JOB_STATES) base[s] = 0;
  return { ...base, ...overrides };
}

describe('<AggregateCountsCards>', () => {
  it('renders one card per JOB_STATES entry with the display label', () => {
    render(<AggregateCountsCards counts={makeCounts()} />);
    for (const state of JOB_STATES) {
      const card = screen.getByTestId(`aggregate-count-${state}`);
      expect(card).toHaveTextContent(stateDisplayName(state));
    }
  });

  it('renders the exact count from the provided map', () => {
    render(
      <AggregateCountsCards
        counts={makeCounts({
          awaiting_moderation: 2,
          enrollment_open: 5,
          payment_sent: 3,
          closed: 47,
        })}
      />,
    );
    expect(
      screen.getByTestId('aggregate-count-value-awaiting_moderation'),
    ).toHaveTextContent('2');
    expect(
      screen.getByTestId('aggregate-count-value-enrollment_open'),
    ).toHaveTextContent('5');
    expect(
      screen.getByTestId('aggregate-count-value-payment_sent'),
    ).toHaveTextContent('3');
    expect(screen.getByTestId('aggregate-count-value-closed')).toHaveTextContent(
      '47',
    );
  });

  it('each card links to /jobs?state=<state>', () => {
    render(<AggregateCountsCards counts={makeCounts()} />);
    for (const state of JOB_STATES) {
      const card = screen.getByTestId(`aggregate-count-${state}`);
      expect(card.getAttribute('href')).toBe(`/jobs?state=${state}`);
    }
  });
});
