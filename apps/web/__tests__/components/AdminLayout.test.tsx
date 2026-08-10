import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminNav, ADMIN_NAV_ENTRIES } from '@/components/AdminNav';

describe('<AdminNav>', () => {
  it('renders all five named admin sections', () => {
    render(<AdminNav disputedCount={0} />);
    expect(ADMIN_NAV_ENTRIES).toHaveLength(5);
    for (const entry of ADMIN_NAV_ENTRIES) {
      expect(screen.getByTestId(entry.testId)).toHaveTextContent(entry.label);
    }
  });

  it('omits the disputes count badge when disputedCount is 0', () => {
    render(<AdminNav disputedCount={0} />);
    expect(
      screen.queryByTestId('admin-nav-disputes-badge'),
    ).not.toBeInTheDocument();
  });

  it('renders the disputes count badge when disputedCount > 0', () => {
    render(<AdminNav disputedCount={3} />);
    const badge = screen.getByTestId('admin-nav-disputes-badge');
    expect(badge).toHaveTextContent('3');
  });

  it('links to the five admin routes', () => {
    render(<AdminNav disputedCount={1} />);
    const expectedHrefs = [
      '/admin',
      '/admin/disputes',
      '/admin/settings',
      '/admin/audit-log',
      '/admin/users',
    ];
    for (const entry of ADMIN_NAV_ENTRIES) {
      const link = screen.getByTestId(entry.testId);
      expect(link.getAttribute('href')).toBe(entry.href);
    }
    expect(expectedHrefs.every((h) =>
      ADMIN_NAV_ENTRIES.some((e) => e.href === h),
    )).toBe(true);
  });

  it('has no Invites entry — onboarding lives at the portal (ADR-013)', () => {
    render(<AdminNav disputedCount={0} />);
    expect(
      ADMIN_NAV_ENTRIES.some((e) => e.href === '/admin/invites'),
    ).toBe(false);
    expect(screen.queryByTestId('admin-nav-invites')).not.toBeInTheDocument();
  });
});
