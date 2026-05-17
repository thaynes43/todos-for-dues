import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const approveMutate = vi.fn();
const rejectMutate = vi.fn();

vi.mock('@/lib/trpc-client', () => ({
  trpc: {
    useUtils: () => ({
      jobs: {
        getById: { invalidate: vi.fn() },
        listModerationQueue: { invalidate: vi.fn() },
        listByState: { invalidate: vi.fn() },
      },
    }),
    jobs: {
      approve: {
        useMutation: () => ({
          mutate: approveMutate,
          isPending: false,
          error: null,
        }),
      },
      reject: {
        useMutation: () => ({
          mutate: rejectMutate,
          isPending: false,
          error: null,
        }),
      },
    },
  },
}));

import { ApproveRejectButtons } from '@/components/ApproveRejectButtons';

beforeEach(() => {
  approveMutate.mockClear();
  rejectMutate.mockClear();
});

describe('<ApproveRejectButtons>', () => {
  it('renders both approve and reject buttons', () => {
    render(<ApproveRejectButtons jobId="job-1" />);
    expect(screen.getByTestId('approve-button')).toBeInTheDocument();
    expect(screen.getByTestId('reject-button')).toBeInTheDocument();
  });

  it('opens the reject modal on Reject click', () => {
    render(<ApproveRejectButtons jobId="job-1" />);
    expect(screen.queryByTestId('reject-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('reject-button'));
    expect(screen.getByTestId('reject-modal')).toBeInTheDocument();
  });

  it('calls jobs.reject.mutate with jobId + reason on submit', () => {
    render(<ApproveRejectButtons jobId="job-1" />);
    fireEvent.click(screen.getByTestId('reject-button'));
    fireEvent.change(screen.getByTestId('reject-reason-textarea'), {
      target: { value: 'dues too low' },
    });
    fireEvent.click(screen.getByTestId('reject-submit'));
    expect(rejectMutate).toHaveBeenCalledWith({
      jobId: 'job-1',
      reason: 'dues too low',
    });
  });

  it('approve button still fires approve mutation', () => {
    render(<ApproveRejectButtons jobId="job-1" />);
    fireEvent.click(screen.getByTestId('approve-button'));
    expect(approveMutate).toHaveBeenCalledWith({ jobId: 'job-1' });
  });
});
