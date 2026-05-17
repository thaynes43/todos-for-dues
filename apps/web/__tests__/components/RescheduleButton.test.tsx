import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mutate = vi.fn();

vi.mock('@/lib/trpc-client', () => ({
  trpc: {
    useUtils: () => ({ jobs: { getById: { invalidate: vi.fn() } } }),
    jobs: {
      reschedule: {
        useMutation: () => ({ mutate, isPending: false, error: null }),
      },
    },
  },
}));

import { RescheduleButton } from '@/components/RescheduleButton';

beforeEach(() => mutate.mockClear());

describe('<RescheduleButton>', () => {
  it('opens confirm modal and shows the "enrollments preserved" message', () => {
    render(<RescheduleButton jobId="job-1" />);
    fireEvent.click(screen.getByTestId('reschedule-button'));
    expect(screen.getByTestId('reschedule-modal')).toBeInTheDocument();
    expect(
      screen.getByText(/Existing enrollments stay on the roster/i),
    ).toBeInTheDocument();
  });

  it('calls jobs.reschedule on confirm click', () => {
    render(<RescheduleButton jobId="job-1" />);
    fireEvent.click(screen.getByTestId('reschedule-button'));
    fireEvent.click(screen.getByTestId('reschedule-confirm'));
    expect(mutate).toHaveBeenCalledWith({ jobId: 'job-1' });
  });
});
