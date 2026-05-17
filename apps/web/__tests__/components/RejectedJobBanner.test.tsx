import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RejectedJobBanner } from '@/components/RejectedJobBanner';

describe('<RejectedJobBanner>', () => {
  it('renders the rejection reason', () => {
    render(<RejectedJobBanner reason="dues too low for the scope" />);
    expect(screen.getByTestId('rejected-job-banner')).toBeInTheDocument();
    expect(screen.getByTestId('rejected-job-reason')).toHaveTextContent(
      /dues too low/i,
    );
  });

  it('shows the Post-a-new-job CTA when canPostNew=true', () => {
    render(<RejectedJobBanner reason="r" canPostNew />);
    const cta = screen.getByTestId('rejected-post-new-cta');
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute('href', '/jobs/new');
  });

  it('omits the CTA when canPostNew is false', () => {
    render(<RejectedJobBanner reason="r" />);
    expect(
      screen.queryByTestId('rejected-post-new-cta'),
    ).not.toBeInTheDocument();
  });
});
