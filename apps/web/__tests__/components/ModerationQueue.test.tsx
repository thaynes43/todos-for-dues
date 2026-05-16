import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const listMock = {
  data: [
    {
      id: 'job-old',
      description: 'Older posting',
      duesAmount: '20.00',
      recommendedPeopleCount: 2,
      state: 'awaiting_moderation' as const,
      createdAt: new Date('2026-01-01T12:00:00Z'),
    },
    {
      id: 'job-new',
      description: 'Newer posting',
      duesAmount: '50.00',
      recommendedPeopleCount: 1,
      state: 'awaiting_moderation' as const,
      createdAt: new Date('2026-02-01T12:00:00Z'),
    },
  ],
  isLoading: false,
  error: null,
};

vi.mock('@/lib/trpc-client', () => ({
  trpc: {
    useUtils: () => ({
      jobs: {
        listModerationQueue: { invalidate: vi.fn() },
        getById: { invalidate: vi.fn() },
        listByState: { invalidate: vi.fn() },
      },
    }),
    jobs: {
      listModerationQueue: { useQuery: () => listMock },
      approve: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
      },
    },
  },
}));

import { ModerationQueue } from '@/components/ModerationQueue';

describe('<ModerationQueue>', () => {
  it('renders rows in the order provided by the server (oldest-first per PRD-002 R-06)', () => {
    render(<ModerationQueue />);
    const rows = screen.getAllByTestId('moderation-queue-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.getAttribute('data-job-id')).toBe('job-old');
    expect(rows[1]!.getAttribute('data-job-id')).toBe('job-new');
  });

  it('renders an Approve button on each row', () => {
    render(<ModerationQueue />);
    expect(screen.getAllByTestId('approve-button')).toHaveLength(2);
  });
});
