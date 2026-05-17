import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClosedJobBanner } from '@/components/ClosedJobBanner';

describe('<ClosedJobBanner>', () => {
  it('renders the closer name', () => {
    render(<ClosedJobBanner closedByDisplayName="Alice Active" />);
    expect(screen.getByTestId('closed-job-banner')).toBeInTheDocument();
    expect(screen.getByTestId('closed-by-name')).toHaveTextContent(
      /Alice Active/,
    );
  });

  it('falls back to a generic "chapter member" when name is missing', () => {
    render(<ClosedJobBanner closedByDisplayName={null} />);
    expect(screen.getByTestId('closed-by-name')).toHaveTextContent(
      /chapter member/i,
    );
  });
});
