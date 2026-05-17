'use client';

import { trpc } from '@/lib/trpc-client';
import { formatChapterLocal } from '@/lib/formatters';

export function RoleChangeHistoryTable({ userId }: { userId: string }) {
  const history = trpc.users.getRoleHistory.useQuery({ userId });

  if (history.isLoading) {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="role-history-loading"
      >
        Loading role history…
      </p>
    );
  }
  if (history.error) {
    return (
      <p
        role="alert"
        className="text-sm text-red-700"
        data-testid="role-history-error"
      >
        {history.error.message}
      </p>
    );
  }
  const rows = history.data ?? [];
  if (rows.length === 0) {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="role-history-empty"
      >
        No role changes recorded for this user.
      </p>
    );
  }

  return (
    <table
      className="w-full border-collapse text-sm"
      data-testid="role-change-history-table"
    >
      <thead className="border-b bg-muted/40 text-left">
        <tr>
          <th className="px-3 py-2 font-medium">When</th>
          <th className="px-3 py-2 font-medium">Transition</th>
          <th className="px-3 py-2 font-medium">Initiator</th>
          <th className="px-3 py-2 font-medium">Note</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const created =
            typeof row.createdAt === 'string'
              ? new Date(row.createdAt)
              : row.createdAt;
          const iso = created.toISOString();
          const initiator =
            row.initiatorKind === 'system' ? 'system' : row.initiatorId ?? '—';
          return (
            <tr
              key={row.id}
              className="border-b align-top last:border-b-0"
              data-testid="role-history-row"
              data-transition-id={row.id}
              data-to-role={row.toRole}
            >
              <td className="px-3 py-2 whitespace-nowrap">
                <time dateTime={iso} title={iso}>
                  {formatChapterLocal(created)}
                </time>
              </td>
              <td className="px-3 py-2">
                <span data-testid="role-history-from">
                  {row.fromRole ?? '∅'}
                </span>
                {' → '}
                <span data-testid="role-history-to">{row.toRole}</span>
              </td>
              <td className="px-3 py-2" data-testid="role-history-initiator">
                {initiator}
              </td>
              <td className="px-3 py-2 whitespace-pre-line">
                {row.note ?? ''}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
