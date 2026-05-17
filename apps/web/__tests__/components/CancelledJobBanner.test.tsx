import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CancelledJobBanner } from '@/components/CancelledJobBanner';

describe('<CancelledJobBanner>', () => {
  it('renders the cancellation reason', () => {
    render(<CancelledJobBanner reason="Mom's couch already moved" />);
    expect(screen.getByTestId('cancelled-job-banner')).toBeInTheDocument();
    expect(screen.getByTestId('cancelled-job-reason')).toHaveTextContent(
      /already moved/i,
    );
  });

  it('does not render any action buttons', () => {
    render(<CancelledJobBanner reason="r" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
