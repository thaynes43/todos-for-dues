import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mutate = vi.fn();

vi.mock('@/lib/trpc-client', () => ({
  trpc: {
    useUtils: () => ({ jobs: { getById: { invalidate: vi.fn() } } }),
    jobs: {
      dispute: {
        useMutation: () => ({ mutate, isPending: false, error: null }),
      },
    },
  },
}));

import { DisputeJobModal } from '@/components/DisputeJobModal';

beforeEach(() => mutate.mockClear());

describe('<DisputeJobModal>', () => {
  it('keeps submit disabled until reason is non-empty (PRD-006 AC-06)', () => {
    render(<DisputeJobModal jobId="job-1" />);
    fireEvent.click(screen.getByTestId('dispute-button'));
    expect(screen.getByTestId('dispute-submit')).toBeDisabled();
    fireEvent.change(screen.getByTestId('dispute-reason'), {
      target: { value: '   ' },
    });
    expect(screen.getByTestId('dispute-submit')).toBeDisabled();
    fireEvent.change(screen.getByTestId('dispute-reason'), {
      target: { value: 'treasurer never credited me' },
    });
    expect(screen.getByTestId('dispute-submit')).not.toBeDisabled();
  });

  it('calls jobs.dispute with trimmed reason', () => {
    render(<DisputeJobModal jobId="job-1" />);
    fireEvent.click(screen.getByTestId('dispute-button'));
    fireEvent.change(screen.getByTestId('dispute-reason'), {
      target: { value: '  never credited me  ' },
    });
    fireEvent.click(screen.getByTestId('dispute-submit'));
    expect(mutate).toHaveBeenCalledWith({
      jobId: 'job-1',
      reason: 'never credited me',
    });
  });
});
