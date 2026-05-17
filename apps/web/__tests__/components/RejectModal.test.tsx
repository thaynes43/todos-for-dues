import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RejectModal } from '@/components/RejectModal';

describe('<RejectModal>', () => {
  it('renders nothing when closed', () => {
    render(
      <RejectModal
        open={false}
        onClose={() => {}}
        onSubmit={() => {}}
        isPending={false}
      />,
    );
    expect(screen.queryByTestId('reject-modal')).not.toBeInTheDocument();
  });

  it('renders the modal with a textarea + cancel/submit when open', () => {
    render(
      <RejectModal
        open
        onClose={() => {}}
        onSubmit={() => {}}
        isPending={false}
      />,
    );
    expect(screen.getByTestId('reject-modal')).toBeInTheDocument();
    expect(screen.getByTestId('reject-reason-textarea')).toBeInTheDocument();
    expect(screen.getByTestId('reject-cancel')).toBeInTheDocument();
    expect(screen.getByTestId('reject-submit')).toBeInTheDocument();
  });

  it('disables submit until reason has non-whitespace content (PRD-002 R-08)', () => {
    const onSubmit = vi.fn();
    render(
      <RejectModal
        open
        onClose={() => {}}
        onSubmit={onSubmit}
        isPending={false}
      />,
    );
    expect(screen.getByTestId('reject-submit')).toBeDisabled();
    fireEvent.change(screen.getByTestId('reject-reason-textarea'), {
      target: { value: '   ' },
    });
    expect(screen.getByTestId('reject-submit')).toBeDisabled();
    fireEvent.change(screen.getByTestId('reject-reason-textarea'), {
      target: { value: 'too vague' },
    });
    expect(screen.getByTestId('reject-submit')).not.toBeDisabled();
  });

  it('calls onSubmit with the trimmed reason', () => {
    const onSubmit = vi.fn();
    render(
      <RejectModal
        open
        onClose={() => {}}
        onSubmit={onSubmit}
        isPending={false}
      />,
    );
    fireEvent.change(screen.getByTestId('reject-reason-textarea'), {
      target: { value: '  dues too low  ' },
    });
    fireEvent.click(screen.getByTestId('reject-submit'));
    expect(onSubmit).toHaveBeenCalledWith('dues too low');
  });
});
