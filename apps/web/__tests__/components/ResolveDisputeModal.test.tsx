import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  closedMutate: vi.fn(),
  cancelledMutate: vi.fn(),
  paymentSentMutate: vi.fn(),
}));

vi.mock('@/lib/trpc-client', () => {
  const make = (mutate: () => void) => ({
    useMutation: ({
      onSuccess: _onSuccess,
    }: { onSuccess?: () => void } = {}) => ({
      mutate,
      isPending: false,
      error: null,
    }),
  });
  return {
    trpc: {
      useUtils: () => ({
        admin: { listDisputed: { invalidate: vi.fn() } },
      }),
      jobs: {
        resolveDisputeAsClosed: make(mocks.closedMutate),
        resolveDisputeAsCancelled: make(mocks.cancelledMutate),
        resolveDisputeAsPaymentSent: make(mocks.paymentSentMutate),
      },
    },
  };
});

const { closedMutate, cancelledMutate, paymentSentMutate } = mocks;

import { ResolveDisputeModal } from '@/components/ResolveDisputeModal';

beforeEach(() => {
  closedMutate.mockClear();
  cancelledMutate.mockClear();
  paymentSentMutate.mockClear();
});

describe('<ResolveDisputeModal>', () => {
  it('renders three primary action buttons (closed / cancelled / false-alarm)', () => {
    render(<ResolveDisputeModal jobId="job-1" />);
    expect(
      screen.getByTestId('resolve-dispute-closed-button'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('resolve-dispute-cancelled-button'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('resolve-dispute-false-alarm-button'),
    ).toBeInTheDocument();
  });

  it('opens a sub-modal with a textarea + disabled submit on empty note', () => {
    render(<ResolveDisputeModal jobId="job-1" />);
    fireEvent.click(screen.getByTestId('resolve-dispute-closed-button'));
    expect(screen.getByTestId('resolve-dispute-modal')).toBeInTheDocument();
    expect(screen.getByTestId('resolve-dispute-note')).toBeInTheDocument();
    expect(screen.getByTestId('resolve-dispute-submit')).toBeDisabled();
    fireEvent.change(screen.getByTestId('resolve-dispute-note'), {
      target: { value: '   ' },
    });
    expect(screen.getByTestId('resolve-dispute-submit')).toBeDisabled();
    fireEvent.change(screen.getByTestId('resolve-dispute-note'), {
      target: { value: 'closed by Admin' },
    });
    expect(screen.getByTestId('resolve-dispute-submit')).not.toBeDisabled();
  });

  it('routes Mark closed → resolveDisputeAsClosed.mutate with trimmed note', () => {
    render(<ResolveDisputeModal jobId="job-1" />);
    fireEvent.click(screen.getByTestId('resolve-dispute-closed-button'));
    fireEvent.change(screen.getByTestId('resolve-dispute-note'), {
      target: { value: '  closed by Admin  ' },
    });
    fireEvent.click(screen.getByTestId('resolve-dispute-submit'));
    expect(closedMutate).toHaveBeenCalledTimes(1);
    expect(cancelledMutate).not.toHaveBeenCalled();
    expect(paymentSentMutate).not.toHaveBeenCalled();
  });

  it('routes Mark cancelled → resolveDisputeAsCancelled.mutate', () => {
    render(<ResolveDisputeModal jobId="job-1" />);
    fireEvent.click(screen.getByTestId('resolve-dispute-cancelled-button'));
    fireEvent.change(screen.getByTestId('resolve-dispute-note'), {
      target: { value: 'cancelled per chapter agreement' },
    });
    fireEvent.click(screen.getByTestId('resolve-dispute-submit'));
    expect(cancelledMutate).toHaveBeenCalledTimes(1);
    expect(closedMutate).not.toHaveBeenCalled();
    expect(paymentSentMutate).not.toHaveBeenCalled();
  });

  it('routes Mark false-alarm → resolveDisputeAsPaymentSent.mutate', () => {
    render(<ResolveDisputeModal jobId="job-1" />);
    fireEvent.click(screen.getByTestId('resolve-dispute-false-alarm-button'));
    fireEvent.change(screen.getByTestId('resolve-dispute-note'), {
      target: { value: 'treasurer confirmed the credit went out' },
    });
    fireEvent.click(screen.getByTestId('resolve-dispute-submit'));
    expect(paymentSentMutate).toHaveBeenCalledTimes(1);
    expect(closedMutate).not.toHaveBeenCalled();
    expect(cancelledMutate).not.toHaveBeenCalled();
  });
});
