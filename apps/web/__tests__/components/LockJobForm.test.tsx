import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mutate = vi.fn();

interface MutationState {
  isPending: boolean;
  error: { message: string } | null;
}

const mutationState: MutationState = {
  isPending: false,
  error: null,
};

vi.mock('@/lib/trpc-client', () => ({
  trpc: {
    useUtils: () => ({ jobs: { getById: { invalidate: vi.fn() } } }),
    jobs: {
      lock: {
        useMutation: () => ({
          mutate,
          get isPending() {
            return mutationState.isPending;
          },
          get error() {
            return mutationState.error;
          },
        }),
      },
    },
  },
}));

import { LockJobForm } from '@/components/LockJobForm';

function futureLocalDatetime(daysAhead: number) {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function pastLocalDatetime() {
  const d = new Date(Date.now() - 86_400_000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

beforeEach(() => {
  mutate.mockClear();
  mutationState.isPending = false;
  mutationState.error = null;
});

describe('<LockJobForm>', () => {
  it('submits a future ISO work date', () => {
    render(<LockJobForm jobId="job-1" enrolleeCount={1} />);
    fireEvent.change(screen.getByTestId('lock-job-work-date'), {
      target: { value: futureLocalDatetime(3) },
    });
    fireEvent.click(screen.getByTestId('lock-job-submit'));
    expect(mutate).toHaveBeenCalledTimes(1);
    const call = mutate.mock.calls[0]![0];
    expect(call.jobId).toBe('job-1');
    expect(new Date(call.workDate).getTime()).toBeGreaterThan(Date.now());
  });

  it('still forwards past dates to the server (MVP-FIX-B #7: server owns the future-date rule)', () => {
    render(<LockJobForm jobId="job-1" enrolleeCount={1} />);
    fireEvent.change(screen.getByTestId('lock-job-work-date'), {
      target: { value: pastLocalDatetime() },
    });
    expect(screen.getByTestId('lock-job-submit')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('lock-job-submit'));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('disables submit when enrollee count is zero', () => {
    render(<LockJobForm jobId="job-1" enrolleeCount={0} />);
    fireEvent.change(screen.getByTestId('lock-job-work-date'), {
      target: { value: futureLocalDatetime(2) },
    });
    expect(screen.getByTestId('lock-job-submit')).toBeDisabled();
  });

  it('renders the mutation error message inline when the server rejects (MVP-FIX-B #7)', () => {
    mutationState.error = { message: 'Work date must be in the future.' };
    render(<LockJobForm jobId="job-1" enrolleeCount={1} />);
    const alert = screen.getByTestId('lock-job-error');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent('Work date must be in the future.');
  });
});
