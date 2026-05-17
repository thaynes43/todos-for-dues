import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mutate = vi.fn();

vi.mock('@/lib/trpc-client', () => ({
  trpc: {
    useUtils: () => ({ jobs: { getById: { invalidate: vi.fn() } } }),
    jobs: {
      cancel: {
        useMutation: () => ({ mutate, isPending: false, error: null }),
      },
    },
  },
}));

import { CancelJobModal } from '@/components/CancelJobModal';

beforeEach(() => mutate.mockClear());

describe('<CancelJobModal>', () => {
  it('opens the modal on click', () => {
    render(<CancelJobModal jobId="job-1" />);
    fireEvent.click(screen.getByTestId('cancel-job-button'));
    expect(screen.getByTestId('cancel-job-modal')).toBeInTheDocument();
  });

  it('keeps submit disabled until reason is non-empty (PRD-004 AC-14)', () => {
    render(<CancelJobModal jobId="job-1" />);
    fireEvent.click(screen.getByTestId('cancel-job-button'));
    expect(screen.getByTestId('cancel-job-submit')).toBeDisabled();
    fireEvent.change(screen.getByTestId('cancel-job-reason'), {
      target: { value: '   ' },
    });
    expect(screen.getByTestId('cancel-job-submit')).toBeDisabled();
    fireEvent.change(screen.getByTestId('cancel-job-reason'), {
      target: { value: 'changed plans' },
    });
    expect(screen.getByTestId('cancel-job-submit')).not.toBeDisabled();
  });

  it('submits with the trimmed reason', () => {
    render(<CancelJobModal jobId="job-1" />);
    fireEvent.click(screen.getByTestId('cancel-job-button'));
    fireEvent.change(screen.getByTestId('cancel-job-reason'), {
      target: { value: '  changed plans  ' },
    });
    fireEvent.click(screen.getByTestId('cancel-job-submit'));
    expect(mutate).toHaveBeenCalledWith({
      jobId: 'job-1',
      reason: 'changed plans',
    });
  });
});
