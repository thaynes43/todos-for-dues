import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminNav, ADMIN_NAV_ENTRIES } from '@/components/AdminNav';

describe('<AdminNav>', () => {
  it('renders all six named admin sections', () => {
    render(<AdminNav disputedCount={0} />);
    expect(ADMIN_NAV_ENTRIES).toHaveLength(6);
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

  it('links to the six admin routes', () => {
    render(<AdminNav disputedCount={1} />);
    const expectedHrefs = [
      '/admin',
      '/admin/disputes',
      '/admin/settings',
      '/admin/audit-log',
      '/admin/invites',
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

  it('places the Invites entry between Audit-log and Users (PLAN-014 Q-PLN-01)', () => {
    render(<AdminNav disputedCount={0} />);
    const orderedHrefs = ADMIN_NAV_ENTRIES.map((e) => e.href);
    const auditIdx = orderedHrefs.indexOf('/admin/audit-log');
    const invitesIdx = orderedHrefs.indexOf('/admin/invites');
    const usersIdx = orderedHrefs.indexOf('/admin/users');
    expect(invitesIdx).toBe(auditIdx + 1);
    expect(usersIdx).toBe(invitesIdx + 1);
    const invitesLink = screen.getByTestId('admin-nav-invites');
    expect(invitesLink.getAttribute('href')).toBe('/admin/invites');
    expect(invitesLink).toHaveTextContent('Invites');
  });
});
