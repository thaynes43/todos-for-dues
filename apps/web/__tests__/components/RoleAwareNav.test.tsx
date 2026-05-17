import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Role } from '@app/db/schema';
import { RoleAwareNav } from '@/components/RoleAwareNav';

const ALL_ROLES: ReadonlyArray<Role> = ['Active', 'Alumni', 'Moderator', 'Admin'];

describe('<RoleAwareNav>', () => {
  it('renders nothing when role is null', () => {
    const { container } = render(<RoleAwareNav role={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  describe('Admin entry visibility (PLAN-014 Gap 1)', () => {
    it('shows the Admin entry for Admin', () => {
      render(<RoleAwareNav role="Admin" />);
      const link = screen.getByRole('link', { name: 'Admin' });
      expect(link.getAttribute('href')).toBe('/admin');
    });

    it.each<Role>(['Active', 'Alumni', 'Moderator'])(
      'hides the Admin entry for %s',
      (role) => {
        render(<RoleAwareNav role={role} />);
        expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
      },
    );
  });

  describe('Existing per-role entries still resolve', () => {
    it.each(ALL_ROLES)('shows Jobs + Profile for %s', (role) => {
      render(<RoleAwareNav role={role} />);
      expect(screen.getByRole('link', { name: 'Jobs' })).toHaveAttribute('href', '/jobs');
      expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/profile');
    });

    it('shows Post a job for Alumni / Moderator / Admin and hides for Active', () => {
      for (const role of ['Alumni', 'Moderator', 'Admin'] as const) {
        const { unmount } = render(<RoleAwareNav role={role} />);
        expect(screen.getByRole('link', { name: 'Post a job' })).toHaveAttribute(
          'href',
          '/jobs/new',
        );
        unmount();
      }
      render(<RoleAwareNav role="Active" />);
      expect(screen.queryByRole('link', { name: 'Post a job' })).not.toBeInTheDocument();
    });

    it('shows Moderation queue only for Moderator / Admin', () => {
      for (const role of ['Moderator', 'Admin'] as const) {
        const { unmount } = render(<RoleAwareNav role={role} />);
        expect(screen.getByRole('link', { name: 'Moderation queue' })).toHaveAttribute(
          'href',
          '/moderation-queue',
        );
        unmount();
      }
      for (const role of ['Active', 'Alumni'] as const) {
        const { unmount } = render(<RoleAwareNav role={role} />);
        expect(
          screen.queryByRole('link', { name: 'Moderation queue' }),
        ).not.toBeInTheDocument();
        unmount();
      }
    });
  });
});
