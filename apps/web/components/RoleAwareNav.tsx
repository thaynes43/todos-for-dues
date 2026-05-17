import Link from 'next/link';
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
];

export function RoleAwareNav({ role }: { role: Role | null }) {
  if (!role) return null;
  const visible = NAV_LINKS.filter((l) => l.roles.includes(role));
  return (
    <nav aria-label="primary" className="border-b bg-muted/40 px-4 py-2">
      <ul className="mx-auto flex max-w-5xl gap-4 text-sm">
        {visible.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="hover:underline">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
