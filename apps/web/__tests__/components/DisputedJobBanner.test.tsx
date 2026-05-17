import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DisputedJobBanner } from '@/components/DisputedJobBanner';

describe('<DisputedJobBanner>', () => {
  it('renders the "Admin is reviewing" copy', () => {
    render(<DisputedJobBanner />);
    expect(screen.getByTestId('disputed-job-banner')).toBeInTheDocument();
    expect(screen.getByText(/Admin is reviewing/)).toBeInTheDocument();
  });

  it('does not render any resolve actions (those live in /admin/disputes)', () => {
    render(<DisputedJobBanner />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders the dispute reason when provided', () => {
    render(<DisputedJobBanner reason="treasurer never credited me" />);
    expect(screen.getByTestId('disputed-job-reason')).toHaveTextContent(
      /never credited/,
    );
  });
});
