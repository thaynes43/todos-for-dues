import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mutate = vi.fn();

vi.mock('@/lib/trpc-client', () => ({
  trpc: {
    useUtils: () => ({ jobs: { getById: { invalidate: vi.fn() } } }),
    jobs: {
      confirmReceipt: {
        useMutation: () => ({ mutate, isPending: false, error: null }),
      },
    },
  },
}));

import { ConfirmReceivedButton } from '@/components/ConfirmReceivedButton';

beforeEach(() => {
  mutate.mockClear();
});

describe('<ConfirmReceivedButton>', () => {
  it('fires confirmReceipt on a single click', () => {
    render(<ConfirmReceivedButton jobId="job-1" />);
    fireEvent.click(screen.getByTestId('confirm-received-button'));
    expect(mutate).toHaveBeenCalledWith({ jobId: 'job-1' });
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
