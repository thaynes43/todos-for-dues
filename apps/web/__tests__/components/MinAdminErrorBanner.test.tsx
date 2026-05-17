import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { MinAdminErrorBanner } from '@/components/MinAdminErrorBanner';

describe('<MinAdminErrorBanner>', () => {
  it('renders with ARIA role=alert', () => {
    render(<MinAdminErrorBanner canPromote={true} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByTestId('min-admin-error-banner')).toBeInTheDocument();
  });

  it('uses the PRD-008 §5.2 wording verbatim', () => {
    render(<MinAdminErrorBanner canPromote={false} />);
    expect(screen.getByTestId('min-admin-error-banner')).toHaveTextContent(
      "Cannot demote — this is the chapter's only Admin.",
    );
    expect(screen.getByTestId('min-admin-error-banner')).toHaveTextContent(
      /Demoting yourself now would leave the chapter without an Admin/,
    );
    expect(screen.getByTestId('min-admin-error-banner')).toHaveTextContent(
      /promote another user to Admin first/i,
    );
  });

  it('renders the contextual link when canPromote=true', () => {
    render(<MinAdminErrorBanner canPromote={true} />);
    const link = screen.getByTestId('min-admin-error-banner-link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute(
      'href',
      '/admin/users?returnTo=%2Fprofile',
    );
    expect(link).toHaveTextContent(/Promote another user to Admin first →/);
  });

  it('omits the contextual link when canPromote=false', () => {
    render(<MinAdminErrorBanner canPromote={false} />);
    expect(
      screen.queryByTestId('min-admin-error-banner-link'),
    ).not.toBeInTheDocument();
  });

  it('encodes a custom returnTo in the link href', () => {
    render(
      <MinAdminErrorBanner canPromote={true} returnTo="/profile?tab=role" />,
    );
    const link = screen.getByTestId('min-admin-error-banner-link');
    expect(link).toHaveAttribute(
      'href',
      '/admin/users?returnTo=%2Fprofile%3Ftab%3Drole',
    );
  });
});
