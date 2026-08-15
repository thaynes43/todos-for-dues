'use client';

import Link from 'next/link';
import type { Role } from '@app/db/schema';
import { trpc } from '@/lib/trpc-client';
import { tierPill } from '@/components/ui/styles';

interface UserRow {
  id: string;
  displayName: string;
  email: string;
  role: Role;
}

/**
 * Admin roster (read-only). ADR-015: roles are portal-derived only — there is
 * no in-app role-change surface anymore (the self-service/admin role writers
 * were removed with the incident that motivated the orthogonality ruling).
 * Role changes happen at the sigoalumni.org portal and land on next sign-in via
 * claim-sync. This table shows the roster; it never mutates a role.
 */
export function UserListTable() {
  const list = trpc.users.list.useQuery();

  if (list.isLoading) {
    return (
      <p className="text-sm opacity-70" data-testid="users-loading">
        Loading users…
      </p>
    );
  }
  if (list.error) {
    return (
      <p
        role="alert"
        className="text-sm text-red-700 dark:text-red-300"
        data-testid="users-error"
      >
        {list.error.message}
      </p>
    );
  }
  const rows = (list.data ?? []) as UserRow[];

  return (
    <div className="space-y-3" data-testid="user-list-table-root">
      <p className="text-sm opacity-70" data-testid="user-list-portal-note">
        Roles come from the Sigo Alumni portal and update on the member&apos;s
        next sign-in.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" data-testid="user-list-table">
          <thead className="border-b border-stone-300 text-left text-sm dark:border-stone-700">
            <tr>
              <th className="px-3 py-2 font-medium">Display name</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Role</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-stone-200 align-top last:border-b-0 dark:border-stone-800"
                data-testid="user-list-row"
                data-user-id={row.id}
                data-user-role={row.role}
              >
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/users/${row.id}`}
                    className="font-medium hover:underline"
                    data-testid="user-list-display-name"
                  >
                    {row.displayName}
                  </Link>
                </td>
                <td className="px-3 py-2 opacity-70">{row.email}</td>
                <td className="px-3 py-2">
                  <span className={tierPill} data-testid="user-list-role">
                    {row.role}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
