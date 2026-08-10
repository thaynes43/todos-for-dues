import Link from 'next/link';
import { cn } from '@/lib/utils';
import { pillBase, statusTones } from '@/components/ui/styles';

export interface AdminNavEntry {
  href: string;
  label: string;
  testId: string;
}

export const ADMIN_NAV_ENTRIES: ReadonlyArray<AdminNavEntry> = [
  { href: '/admin', label: 'Dashboard', testId: 'admin-nav-dashboard' },
  { href: '/admin/disputes', label: 'Disputes', testId: 'admin-nav-disputes' },
  { href: '/admin/settings', label: 'Settings', testId: 'admin-nav-settings' },
  { href: '/admin/audit-log', label: 'Job history', testId: 'admin-nav-audit-log' },
  // PLAN-014 Q-PLN-01 lean: Invites sits between Audit-log and Users so
  // member-onboarding actions cluster near role management.
  { href: '/admin/invites', label: 'Invites', testId: 'admin-nav-invites' },
  { href: '/admin/users', label: 'Users', testId: 'admin-nav-users' },
];

export function AdminNav({ disputedCount }: { disputedCount: number }) {
  return (
    <aside aria-label="Admin navigation" className="sm:w-56 sm:shrink-0">
      <ul
        className="flex flex-row flex-wrap gap-1 sm:flex-col"
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
                className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <span>{entry.label}</span>
                {showBadge ? (
                  <span
                    data-testid="admin-nav-disputes-badge"
                    className={cn(
                      pillBase,
                      statusTones.warning,
                      'min-w-6 justify-center font-semibold',
                    )}
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
