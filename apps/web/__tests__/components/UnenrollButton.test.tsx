import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mutate = vi.fn();

vi.mock('@/lib/trpc-client', () => ({
  trpc: {
    useUtils: () => ({
      jobs: {
        getById: { invalidate: vi.fn() },
        listMyEnrolled: { invalidate: vi.fn() },
      },
    }),
    jobs: {
      unenroll: {
        useMutation: () => ({ mutate, isPending: false, error: null }),
      },
    },
  },
}));

import { UnenrollButton } from '@/components/UnenrollButton';

beforeEach(() => mutate.mockClear());

describe('<UnenrollButton>', () => {
  it('calls jobs.unenroll on click when enrollment_open', () => {
    render(<UnenrollButton jobId="job-1" state="enrollment_open" />);
    fireEvent.click(screen.getByTestId('unenroll-button'));
    expect(mutate).toHaveBeenCalledWith({ jobId: 'job-1' });
  });

  it('is disabled when state is not enrollment_open (PRD-004 AC-05)', () => {
    render(<UnenrollButton jobId="job-1" state="locked" />);
    expect(screen.getByTestId('unenroll-button')).toBeDisabled();
  });
});
