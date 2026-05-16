import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mutate = vi.fn();

vi.mock('@/lib/trpc-client', () => ({
  trpc: {
    useUtils: () => ({ jobs: { getById: { invalidate: vi.fn() } } }),
    jobs: {
      markPaymentSent: {
        useMutation: () => ({ mutate, isPending: false, error: null }),
      },
    },
  },
}));

import { MarkPaymentSentButton } from '@/components/MarkPaymentSentButton';

beforeEach(() => {
  mutate.mockClear();
});

describe('<MarkPaymentSentButton>', () => {
  it('fires markPaymentSent on a single click', () => {
    render(<MarkPaymentSentButton jobId="job-1" />);
    fireEvent.click(screen.getByTestId('mark-payment-sent-button'));
    expect(mutate).toHaveBeenCalledWith({ jobId: 'job-1' });
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('displays the treasurer-recipient address when provided (PRD-005 §6)', () => {
    render(
      <MarkPaymentSentButton
        jobId="job-1"
        treasurerRecipient="treasurer@chapter.test"
      />,
    );
    expect(screen.getByText(/treasurer@chapter\.test/)).toBeInTheDocument();
  });
});
