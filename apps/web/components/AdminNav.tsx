import Link from 'next/link';

export interface AdminNavEntry {
  href: string;
  label: string;
  testId: string;
}

export const ADMIN_NAV_ENTRIES: ReadonlyArray<AdminNavEntry> = [
  { href: '/admin', label: 'Dashboard', testId: 'admin-nav-dashboard' },
  { href: '/admin/disputes', label: 'Disputes', testId: 'admin-nav-disputes' },
  { href: '/admin/settings', label: 'Settings', testId: 'admin-nav-settings' },
  { href: '/admin/audit-log', label: 'Audit log', testId: 'admin-nav-audit-log' },
  { href: '/admin/users', label: 'Users', testId: 'admin-nav-users' },
];

export function AdminNav({ disputedCount }: { disputedCount: number }) {
  return (
    <aside aria-label="Admin navigation" className="md:w-56 md:shrink-0">
      <ul
        className="flex flex-row flex-wrap gap-2 md:flex-col md:gap-1"
        data-testid="admin-nav"
      >
        {ADMIN_NAV_ENTRIES.map((entry) => {
          const showBadge =
            entry.href === '/admin/disputes' && disputedCount > 0;
          return (
            <li key={entry.href}>
              <Link
                href={entry.href}
                data-testid={entry.testId}
                className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-sm hover:bg-muted"
              >
                <span>{entry.label}</span>
                {showBadge ? (
                  <span
                    data-testid="admin-nav-disputes-badge"
                    className="inline-flex min-w-6 items-center justify-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-900"
                  >
                    {disputedCount}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
