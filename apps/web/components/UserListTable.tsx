'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ROLES, type Role } from '@app/db/schema';
import { trpc } from '@/lib/trpc-client';
import { cn } from '@/lib/utils';
import { tierPill } from '@/components/ui/styles';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { MinAdminErrorBanner } from './MinAdminErrorBanner';

interface UserRow {
  id: string;
  displayName: string;
  email: string;
  role: Role;
}

interface PendingDemote {
  user: UserRow;
  toRole: Role;
}


function isInternalPath(value: string | null): value is string {
  if (!value) return false;
  if (!value.startsWith('/')) return false;
  if (value.startsWith('//')) return false;
  if (value.includes('://')) return false;
  return true;
}

export function UserListTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnToRaw = searchParams.get('returnTo');
  const returnTo = isInternalPath(returnToRaw) ? returnToRaw : null;

  const utils = trpc.useUtils();
  const list = trpc.users.list.useQuery();

  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [pendingDemote, setPendingDemote] = useState<PendingDemote | null>(
    null,
  );
  const [minAdminError, setMinAdminError] = useState<{
    targetUserId: string;
  } | null>(null);

  const grantRole = trpc.users.grantRole.useMutation({
    onSuccess: async () => {
      await utils.users.list.invalidate();
      setOpenRowId(null);
      setPendingDemote(null);
      setMinAdminError(null);
      if (returnTo) {
        router.push(returnTo);
      }
    },
    onError: (err, variables) => {
      const appCode = (err.data as { appCode?: string } | undefined)?.appCode;
      if (appCode === 'MIN_ADMIN_INVARIANT_VIOLATED') {
        setMinAdminError({ targetUserId: variables.targetUserId });
        setPendingDemote(null);
      }
    },
  });

  const onChipClick = (row: UserRow) => {
    setOpenRowId((cur) => (cur === row.id ? null : row.id));
  };

  const onSelect = (row: UserRow, toRole: Role) => {
    if (toRole === row.role) {
      setOpenRowId(null);
      return;
    }
    if (row.role === 'Admin' && toRole !== 'Admin') {
      setPendingDemote({ user: row, toRole });
      setOpenRowId(null);
      return;
    }
    grantRole.mutate({ targetUserId: row.id, toRole });
  };

  const onConfirmDemote = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!pendingDemote) return;
    grantRole.mutate({
      targetUserId: pendingDemote.user.id,
      toRole: pendingDemote.toRole,
    });
  };

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
      {returnTo ? (
        <p
          role="status"
          className="rounded-lg bg-stone-100 px-4 py-3 text-stone-800 dark:bg-stone-800 dark:text-stone-200"
          data-testid="user-list-return-banner"
        >
          Grant Admin to another user, then we&apos;ll bring you back.
        </p>
      ) : null}
      {minAdminError ? (
        <MinAdminErrorBanner canPromote={true} returnTo={returnTo ?? undefined} />
      ) : null}
      <div className="overflow-x-auto">
      <table
        className="w-full border-collapse"
        data-testid="user-list-table"
      >
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
                <div className="relative inline-block">
                  <button
                    type="button"
                    onClick={() => onChipClick(row)}
                    aria-haspopup="menu"
                    aria-expanded={openRowId === row.id}
                    data-testid="user-list-role-chip"
                    className={cn(tierPill, 'gap-1 px-3')}
                  >
                    {row.role}
                    <span aria-hidden="true">▾</span>
                  </button>
                  {openRowId === row.id ? (
                    <div
                      role="menu"
                      className="absolute left-0 z-10 mt-1 min-w-[10rem] rounded-2xl border border-stone-200 bg-white p-2 shadow-lg dark:border-stone-800 dark:bg-stone-900"
                      data-testid="user-list-role-menu"
                    >
                      {ROLES.filter((r) => r !== row.role).map((target) => (
                        <button
                          key={target}
                          type="button"
                          role="menuitem"
                          onClick={() => onSelect(row, target)}
                          data-testid={`user-list-role-option-${target}`}
                          className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-800"
                          disabled={grantRole.isPending}
                        >
                          {target}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <Modal
        open={pendingDemote !== null}
        onClose={() => {
          if (!grantRole.isPending) setPendingDemote(null);
        }}
        title="Demote Admin"
        testId="user-list-demote-confirm"
      >
        {pendingDemote ? (
          <form onSubmit={onConfirmDemote} className="space-y-3">
            <p>
              Demote <strong>{pendingDemote.user.displayName}</strong> from
              Admin to {pendingDemote.toRole}? They lose Admin access
              immediately.
            </p>
            {grantRole.error ? (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                {grantRole.error.message}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="neutral"
                onClick={() => setPendingDemote(null)}
                disabled={grantRole.isPending}
                data-testid="user-list-demote-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="neutral"
                disabled={grantRole.isPending}
                data-testid="user-list-demote-confirm-submit"
              >
                {grantRole.isPending ? 'Demoting…' : 'Demote'}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
