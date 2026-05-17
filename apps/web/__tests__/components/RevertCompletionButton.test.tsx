import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mutate = vi.fn();

vi.mock('@/lib/trpc-client', () => ({
  trpc: {
    useUtils: () => ({ jobs: { getById: { invalidate: vi.fn() } } }),
    jobs: {
      revertCompletion: {
        useMutation: () => ({ mutate, isPending: false, error: null }),
      },
    },
  },
}));

import { RevertCompletionButton } from '@/components/RevertCompletionButton';

beforeEach(() => mutate.mockClear());

describe('<RevertCompletionButton>', () => {
  it('opens the confirmation modal with the "clears attendees" warning', () => {
    render(<RevertCompletionButton jobId="job-1" />);
    fireEvent.click(screen.getByTestId('revert-completion-button'));
    expect(screen.getByTestId('revert-completion-modal')).toBeInTheDocument();
    expect(
      screen.getByText(/clears the confirmed-attendees list/i),
    ).toBeInTheDocument();
  });

  it('calls jobs.revertCompletion on confirm', () => {
    render(<RevertCompletionButton jobId="job-1" />);
    fireEvent.click(screen.getByTestId('revert-completion-button'));
    fireEvent.click(screen.getByTestId('revert-completion-confirm'));
    expect(mutate).toHaveBeenCalledWith({ jobId: 'job-1' });
  });
});
