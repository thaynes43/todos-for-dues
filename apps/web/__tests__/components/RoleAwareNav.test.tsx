import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import type { Role } from '@app/db/schema';
import { RoleAwareNav, type NavCapabilities } from '@/components/RoleAwareNav';

// ADR-015: roles are Member | Moderator | Admin only. The post/claim nav
// surfaces are gated by member-STATUS capabilities (caps), fully orthogonal to
// role; the privileged surfaces (Moderation queue, Admin) still gate on role.
const ALL_ROLES: ReadonlyArray<Role> = ['Member', 'Moderator', 'Admin'];

const NO_CAPS: NavCapabilities = { canPost: false, canClaim: false };
const POST_ONLY: NavCapabilities = { canPost: true, canClaim: false };
const CLAIM_ONLY: NavCapabilities = { canPost: false, canClaim: true };

const usePathnameMock = vi.mocked(usePathname);

beforeEach(() => {
  usePathnameMock.mockReturnValue('/');
});

describe('<RoleAwareNav>', () => {
  it('renders nothing when role is null', () => {
    const { container } = render(<RoleAwareNav role={null} caps={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  describe('Admin entry visibility (role-gated)', () => {
    it('shows the Admin entry for Admin', () => {
      render(<RoleAwareNav role="Admin" caps={NO_CAPS} />);
      const link = screen.getByRole('link', { name: 'Admin' });
      expect(link.getAttribute('href')).toBe('/admin');
    });

    it.each<Role>(['Member', 'Moderator'])(
      'hides the Admin entry for %s',
      (role) => {
        render(<RoleAwareNav role={role} caps={NO_CAPS} />);
        expect(
          screen.queryByRole('link', { name: 'Admin' }),
        ).not.toBeInTheDocument();
      },
    );
  });

  describe('Always-visible entries', () => {
    it.each(ALL_ROLES)('shows Jobs + Profile for %s', (role) => {
      render(<RoleAwareNav role={role} caps={NO_CAPS} />);
      expect(screen.getByRole('link', { name: 'Jobs' })).toHaveAttribute(
        'href',
        '/jobs',
      );
      expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute(
        'href',
        '/profile',
      );
    });
  });

  describe('Status-capability entries are orthogonal to role', () => {
    it('shows Post a job + My postings iff caps.canPost — regardless of role', () => {
      // A plain Member with post capability (alumni status) sees them…
      const { unmount } = render(
        <RoleAwareNav role="Member" caps={POST_ONLY} />,
      );
      expect(screen.getByRole('link', { name: 'Post a job' })).toHaveAttribute(
        'href',
        '/jobs/new',
      );
      expect(screen.getByRole('link', { name: 'My postings' })).toHaveAttribute(
        'href',
        '/my-postings',
      );
      unmount();

      // …and an Admin WITHOUT post capability does not (role never grants it).
      render(<RoleAwareNav role="Admin" caps={NO_CAPS} />);
      expect(
        screen.queryByRole('link', { name: 'Post a job' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'My postings' }),
      ).not.toBeInTheDocument();
    });

    it('shows My enrollments iff caps.canClaim — regardless of role', () => {
      const { unmount } = render(
        <RoleAwareNav role="Member" caps={CLAIM_ONLY} />,
      );
      expect(
        screen.getByRole('link', { name: 'My enrollments' }),
      ).toHaveAttribute('href', '/my-enrollments');
      unmount();

      render(<RoleAwareNav role="Admin" caps={NO_CAPS} />);
      expect(
        screen.queryByRole('link', { name: 'My enrollments' }),
      ).not.toBeInTheDocument();
    });

    it('null caps hides both post and claim surfaces', () => {
      render(<RoleAwareNav role="Admin" caps={null} />);
      expect(
        screen.queryByRole('link', { name: 'Post a job' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'My enrollments' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('Moderation queue is role-gated', () => {
    it('shows Moderation queue only for Moderator / Admin', () => {
      for (const role of ['Moderator', 'Admin'] as const) {
        const { unmount } = render(
          <RoleAwareNav role={role} caps={NO_CAPS} />,
        );
        expect(
          screen.getByRole('link', { name: 'Moderation queue' }),
        ).toHaveAttribute('href', '/moderation-queue');
        unmount();
      }
      render(<RoleAwareNav role="Member" caps={CLAIM_ONLY} />);
      expect(
        screen.queryByRole('link', { name: 'Moderation queue' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('Active-state highlighting (MVP-FIX-B #3)', () => {
    it('marks the matching link with aria-current="page" and data-active="true"', () => {
      usePathnameMock.mockReturnValue('/moderation-queue');
      render(<RoleAwareNav role="Admin" caps={NO_CAPS} />);
      const active = screen.getByRole('link', { name: 'Moderation queue' });
      expect(active).toHaveAttribute('aria-current', 'page');
      expect(active).toHaveAttribute('data-active', 'true');
      const inactive = screen.getByRole('link', { name: 'Jobs' });
      expect(inactive).not.toHaveAttribute('aria-current');
      expect(inactive).toHaveAttribute('data-active', 'false');
    });

    it('picks the longest-prefix match — /jobs/new highlights "Post a job", not "Jobs"', () => {
      usePathnameMock.mockReturnValue('/jobs/new');
      render(<RoleAwareNav role="Member" caps={POST_ONLY} />);
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
      render(<RoleAwareNav role="Member" caps={NO_CAPS} />);
      expect(screen.getByRole('link', { name: 'Jobs' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });

    it('highlights Admin for any /admin/* subroute', () => {
      usePathnameMock.mockReturnValue('/admin/users');
      render(<RoleAwareNav role="Admin" caps={NO_CAPS} />);
      expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });

    it('marks no link active when on a non-nav route', () => {
      usePathnameMock.mockReturnValue('/login');
      render(<RoleAwareNav role="Member" caps={NO_CAPS} />);
      for (const link of screen.getAllByRole('link')) {
        expect(link).toHaveAttribute('data-active', 'false');
      }
    });
  });
});
