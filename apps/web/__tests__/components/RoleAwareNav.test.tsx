import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import type { Role } from '@app/db/schema';
import { RoleAwareNav } from '@/components/RoleAwareNav';

const ALL_ROLES: ReadonlyArray<Role> = ['Active', 'Alumni', 'Moderator', 'Admin'];

const usePathnameMock = vi.mocked(usePathname);

beforeEach(() => {
  usePathnameMock.mockReturnValue('/');
});

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

  describe('Active-state highlighting (MVP-FIX-B #3)', () => {
    it('marks the matching link with aria-current="page" and data-active="true"', () => {
      usePathnameMock.mockReturnValue('/moderation-queue');
      render(<RoleAwareNav role="Admin" />);
      const active = screen.getByRole('link', { name: 'Moderation queue' });
      expect(active).toHaveAttribute('aria-current', 'page');
      expect(active).toHaveAttribute('data-active', 'true');
      const inactive = screen.getByRole('link', { name: 'Jobs' });
      expect(inactive).not.toHaveAttribute('aria-current');
      expect(inactive).toHaveAttribute('data-active', 'false');
    });

    it('picks the longest-prefix match — /jobs/new highlights "Post a job", not "Jobs"', () => {
      usePathnameMock.mockReturnValue('/jobs/new');
      render(<RoleAwareNav role="Alumni" />);
      expect(
        screen.getByRole('link', { name: 'Post a job' }),
      ).toHaveAttribute('aria-current', 'page');
      expect(screen.getByRole('link', { name: 'Jobs' })).toHaveAttribute(
        'data-active',
        'false',
      );
    });

    it('treats nested job-detail routes as a Jobs match — /jobs/abc highlights "Jobs"', () => {
      usePathnameMock.mockReturnValue('/jobs/abc-123');
      render(<RoleAwareNav role="Active" />);
      expect(screen.getByRole('link', { name: 'Jobs' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });

    it('highlights Admin for any /admin/* subroute', () => {
      usePathnameMock.mockReturnValue('/admin/users');
      render(<RoleAwareNav role="Admin" />);
      expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });

    it('marks no link active when on a non-nav route', () => {
      usePathnameMock.mockReturnValue('/login');
      render(<RoleAwareNav role="Active" />);
      for (const link of screen.getAllByRole('link')) {
        expect(link).toHaveAttribute('data-active', 'false');
      }
    });
  });
});
