import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/lib/trpc-client', () => {
  const stubMutation = () => ({
    useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  });
  return {
    trpc: {
      useUtils: () => ({
        admin: { listDisputed: { invalidate: vi.fn() } },
      }),
      jobs: {
        resolveDisputeAsClosed: stubMutation(),
        resolveDisputeAsCancelled: stubMutation(),
        resolveDisputeAsPaymentSent: stubMutation(),
      },
    },
  };
});

import { DisputeCardList } from '@/components/DisputeCardList';

describe('<DisputeCardList>', () => {
  it('renders empty state when no rows', () => {
    render(<DisputeCardList rows={[]} />);
    expect(screen.getByTestId('dispute-card-list-empty')).toBeInTheDocument();
  });

  it('shows disputer name + role + reason + age', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    render(
      <DisputeCardList
        rows={[
          {
            id: 'job-1',
            description: 'Clean the gutters',
            disputeReason: "treasurer didn't credit me",
            disputer: {
              id: 'u-1',
              displayName: 'Alice Adams',
              role: 'Active',
            },
            disputedAt: twoDaysAgo,
          },
        ]}
      />,
    );
    const row = screen.getByTestId('dispute-card-row');
    expect(row).toHaveAttribute('data-job-id', 'job-1');
    expect(within(row).getByTestId('dispute-card-link')).toHaveTextContent(
      'Clean the gutters',
    );
    expect(within(row).getByTestId('dispute-card-link').getAttribute('href'))
      .toBe('/admin/jobs/job-1');
    expect(row).toHaveTextContent('Alice Adams');
    expect(row).toHaveTextContent('(Active)');
    expect(within(row).getByTestId('dispute-card-reason')).toHaveTextContent(
      "treasurer didn't credit me",
    );
    expect(within(row).getByTestId('dispute-card-age')).toHaveTextContent('2d');
  });

  it('truncates long descriptions and reasons', () => {
    const longText = 'x'.repeat(150);
    render(
      <DisputeCardList
        rows={[
          {
            id: 'job-2',
            description: longText,
            disputeReason: longText,
            disputer: {
              id: 'u-1',
              displayName: 'Alice',
              role: 'Active',
            },
            disputedAt: new Date(),
          },
        ]}
      />,
    );
    const link = screen.getByTestId('dispute-card-link');
    expect(link.textContent ?? '').toContain('…');
    expect((link.textContent ?? '').length).toBeLessThan(longText.length);
  });
});
