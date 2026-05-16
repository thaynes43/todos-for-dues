import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mutate = vi.fn();

vi.mock('@/lib/trpc-client', () => ({
  trpc: {
    useUtils: () => ({ jobs: { getById: { invalidate: vi.fn() } } }),
    jobs: {
      complete: {
        useMutation: () => ({ mutate, isPending: false, error: null }),
      },
    },
  },
}));

import { CompleteJobForm } from '@/components/CompleteJobForm';

beforeEach(() => {
  mutate.mockClear();
});

describe('<CompleteJobForm>', () => {
  const roster = [
    { activeId: 'a1', displayName: 'Alice' },
    { activeId: 'a2', displayName: 'Bob' },
  ];

  it('submits the checked attendee ids via jobs.complete', () => {
    render(<CompleteJobForm jobId="job-1" roster={roster} />);
    // Both pre-checked
    fireEvent.click(screen.getByTestId('complete-job-submit'));
    expect(mutate).toHaveBeenCalledWith({
      jobId: 'job-1',
      confirmedAttendees: ['a1', 'a2'],
    });
  });

  it('only sends confirmed attendees', () => {
    render(<CompleteJobForm jobId="job-1" roster={roster} />);
    fireEvent.click(screen.getByTestId('complete-attendee-a2'));
    fireEvent.click(screen.getByTestId('complete-job-submit'));
    expect(mutate).toHaveBeenCalledWith({
      jobId: 'job-1',
      confirmedAttendees: ['a1'],
    });
  });

  it('disables submit when no attendees are checked', () => {
    render(<CompleteJobForm jobId="job-1" roster={roster} />);
    fireEvent.click(screen.getByTestId('complete-attendee-a1'));
    fireEvent.click(screen.getByTestId('complete-attendee-a2'));
    expect(screen.getByTestId('complete-job-submit')).toBeDisabled();
  });
});
