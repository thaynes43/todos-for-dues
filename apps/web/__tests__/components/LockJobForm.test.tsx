import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mutate = vi.fn();

vi.mock('@/lib/trpc-client', () => ({
  trpc: {
    useUtils: () => ({ jobs: { getById: { invalidate: vi.fn() } } }),
    jobs: {
      lock: {
        useMutation: () => ({ mutate, isPending: false, error: null }),
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

  it('disables submit for past dates', () => {
    render(<LockJobForm jobId="job-1" enrolleeCount={1} />);
    fireEvent.change(screen.getByTestId('lock-job-work-date'), {
      target: { value: pastLocalDatetime() },
    });
    expect(screen.getByTestId('lock-job-submit')).toBeDisabled();
  });

  it('disables submit when enrollee count is zero', () => {
    render(<LockJobForm jobId="job-1" enrolleeCount={0} />);
    fireEvent.change(screen.getByTestId('lock-job-work-date'), {
      target: { value: futureLocalDatetime(2) },
    });
    expect(screen.getByTestId('lock-job-submit')).toBeDisabled();
  });
});
