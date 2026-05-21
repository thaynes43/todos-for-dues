'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@app/db/schema';

interface NavLink {
  href: string;
  label: string;
  roles: ReadonlyArray<Role>;
}

const NAV_LINKS: ReadonlyArray<NavLink> = [
  { href: '/jobs', label: 'Jobs', roles: ['Active', 'Alumni', 'Moderator', 'Admin'] },
  { href: '/jobs/new', label: 'Post a job', roles: ['Alumni', 'Moderator', 'Admin'] },
  {
    href: '/my-postings',
    label: 'My postings',
    roles: ['Alumni', 'Moderator', 'Admin'],
  },
  {
    href: '/my-enrollments',
    label: 'My enrollments',
    roles: ['Active'],
  },
  {
    href: '/moderation-queue',
    label: 'Moderation queue',
    roles: ['Moderator', 'Admin'],
  },
  { href: '/admin', label: 'Admin', roles: ['Admin'] },
  {
    href: '/profile',
    label: 'Profile',
    roles: ['Active', 'Alumni', 'Moderator', 'Admin'],
  },
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

export function RoleAwareNav({ role }: { role: Role | null }) {
  const pathname = usePathname() ?? '';
  if (!role) return null;
  const visible = NAV_LINKS.filter((l) => l.roles.includes(role));
  const allHrefs = visible.map((l) => l.href);
  return (
    <nav aria-label="primary" className="border-b bg-muted/40 px-4 py-2">
      <ul className="mx-auto flex max-w-5xl gap-4 text-sm">
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
                    ? 'font-semibold text-foreground underline underline-offset-4'
                    : 'text-muted-foreground hover:underline'
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
