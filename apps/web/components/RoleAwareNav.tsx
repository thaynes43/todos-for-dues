'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@app/db/schema';

/** Status-derived capabilities for the nav (ADR-015). Null when signed out. */
export interface NavCapabilities {
  /** status `alumni` → can post. */
  canPost: boolean;
  /** status `active` → can claim/enroll. */
  canClaim: boolean;
}

interface NavLink {
  href: string;
  label: string;
  /** Visibility predicate — role for privileged surfaces, member STATUS
   * capabilities for the post/claim surfaces (ADR-015 orthogonality). */
  show: (role: Role, caps: NavCapabilities) => boolean;
}

const NAV_LINKS: ReadonlyArray<NavLink> = [
  { href: '/jobs', label: 'Jobs', show: () => true },
  { href: '/jobs/new', label: 'Post a job', show: (_r, c) => c.canPost },
  { href: '/my-postings', label: 'My postings', show: (_r, c) => c.canPost },
  { href: '/my-enrollments', label: 'My enrollments', show: (_r, c) => c.canClaim },
  {
    href: '/moderation-queue',
    label: 'Moderation queue',
    show: (role) => role === 'Moderator' || role === 'Admin',
  },
  { href: '/admin', label: 'Admin', show: (role) => role === 'Admin' },
  { href: '/profile', label: 'Profile', show: () => true },
];

// A link is active when its href is the longest-prefix match for the current
// pathname, so `/jobs/new` highlights "Post a job" (not also "Jobs") and
// `/jobs/abc-123` highlights "Jobs".
function isActiveLink(
  pathname: string,
  href: string,
  allHrefs: ReadonlyArray<string>,
): boolean {
  const matches = (h: string) =>
    pathname === h || pathname.startsWith(h + '/');
  if (!matches(href)) return false;
  return !allHrefs.some(
    (other) =>
      other !== href && other.length > href.length && matches(other),
  );
}

export function RoleAwareNav({
  role,
  caps,
}: {
  role: Role | null;
  caps: NavCapabilities | null;
}) {
  const pathname = usePathname() ?? '';
  if (!role) return null;
  const resolvedCaps: NavCapabilities = caps ?? { canPost: false, canClaim: false };
  const visible = NAV_LINKS.filter((l) => l.show(role, resolvedCaps));
  const allHrefs = visible.map((l) => l.href);
  // One line, wraps on phones — no hamburger (design-system main-nav shape).
  return (
    <nav
      aria-label="primary"
      className="border-b border-stone-200 px-6 dark:border-stone-800"
    >
      <ul className="mx-auto flex max-w-5xl flex-wrap gap-x-5 text-sm">
        {visible.map((l) => {
          const active = isActiveLink(pathname, l.href, allHrefs);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? 'page' : undefined}
                data-testid={`nav-link-${l.href}`}
                data-active={active ? 'true' : 'false'}
                className={
                  active
                    ? 'inline-block py-2 font-semibold underline decoration-2 underline-offset-4'
                    : 'inline-block py-2 hover:underline underline-offset-4'
                }
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
