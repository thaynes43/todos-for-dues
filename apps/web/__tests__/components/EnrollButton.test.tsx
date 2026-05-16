import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mutate = vi.fn();
const invalidate = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/trpc-client', () => ({
  trpc: {
    useUtils: () => ({ jobs: { getById: { invalidate } } }),
    jobs: {
      enroll: {
        useMutation: () => ({
          mutate,
          isPending: false,
          error: null,
        }),
      },
    },
  },
}));

import { EnrollButton } from '@/components/EnrollButton';

beforeEach(() => {
  mutate.mockClear();
});

describe('<EnrollButton>', () => {
  it('calls jobs.enroll.mutate with the jobId', async () => {
    render(<EnrollButton jobId="job-1" state="enrollment_open" />);
    await userEvent.setup().click(screen.getByTestId('enroll-button'));
    expect(mutate).toHaveBeenCalledWith({ jobId: 'job-1' });
  });

  it('is disabled when state is not enrollment_open', () => {
    render(<EnrollButton jobId="job-2" state="locked" />);
    expect(screen.getByTestId('enroll-button')).toBeDisabled();
  });
});
