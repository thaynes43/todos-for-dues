'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Role } from '@app/db/schema';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { RoleChangeDropdown } from '@/components/RoleChangeDropdown';

/**
 * Active/Alumni control for non-privileged members (ADR-014). The portal
 * registry is the source of truth: on load we read the fresh status via
 * `memberStatus.get`; picking a side PUTs it back via `memberStatus.set`
 * (which re-reads and syncs the app role).
 *
 * Portal states:
 * - available (`ok`/`undeclared`) → portal-backed buttons below;
 * - `unavailable` (endpoint not shipped / unreachable) → the pre-existing
 *   local-only control (`users.changeRole`), exactly as before;
 * - `no-registry-row` → the control is hidden (nothing to declare against).
 *
 * The button markup mirrors `RoleChangeDropdown` (same test ids, same
 * variants) so the two paths look and behave identically to the member.
 */

const CHOICES = [
  { status: 'active', role: 'Active' },
  { status: 'alumni', role: 'Alumni' },
] as const;

type ChoiceStatus = (typeof CHOICES)[number]['status'];

function roleForStatus(status: ChoiceStatus): Role {
  return status === 'active' ? 'Active' : 'Alumni';
}

export function ProfileStatusSection({ role }: { role: Role }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [saved, setSaved] = useState(false);

  const state = trpc.memberStatus.get.useQuery(undefined, {
    refetchOnWindowFocus: false,
    retry: false,
  });

  const setStatus = trpc.memberStatus.set.useMutation({
    onSuccess: (fresh) => {
      utils.memberStatus.get.setData(undefined, fresh);
      setSaved(fresh.kind === 'ok');
      router.refresh();
    },
  });

  // Our own API erroring is not a portal signal — never block the member;
  // show the local control just like the portal-off path.
  if (state.error) {
    return (
      <div data-testid="profile-status-section" data-portal="error">
        <RoleChangeDropdown currentRole={role} />
      </div>
    );
  }

  if (state.isPending) {
    return (
      <div
        data-testid="profile-status-section"
        data-portal="loading"
        aria-busy="true"
        className="flex flex-wrap items-center gap-2"
      >
        {CHOICES.map((c) => (
          <Button key={c.role} type="button" variant="neutral" size="sm" disabled>
            {c.role}
          </Button>
        ))}
      </div>
    );
  }

  const data = state.data;
  if (!data) return null; // unreachable: !error && !isPending ⇒ data

  if (data.kind === 'unavailable') {
    return (
      <div data-testid="profile-status-section" data-portal="off">
        <RoleChangeDropdown currentRole={data.role} />
      </div>
    );
  }

  if (data.kind === 'no-registry-row') {
    // Nothing to declare against — hide the control entirely.
    return (
      <div data-testid="profile-status-section" data-portal="no-registry-row" />
    );
  }

  const currentRole =
    data.kind === 'ok' && data.status ? roleForStatus(data.status) : data.role;

  const handleSelect = (choice: ChoiceStatus, isCurrent: boolean) => {
    if (isCurrent || setStatus.isPending) return;
    setSaved(false);
    setStatus.mutate({ status: choice });
  };

  return (
    <div
      className="space-y-2"
      data-testid="profile-status-section"
      data-portal="on"
    >
      <div
        role="group"
        aria-label="Active or Alumni?"
        data-testid="role-change-dropdown"
        data-current-role={currentRole}
        data-portal-backed="true"
        className="flex flex-wrap items-center gap-2"
      >
        {CHOICES.map((c) => {
          const isCurrent = c.role === currentRole;
          return (
            <Button
              key={c.role}
              type="button"
              variant={isCurrent ? 'secondary' : 'neutral'}
              size="sm"
              disabled={isCurrent || setStatus.isPending}
              onClick={() => handleSelect(c.status, isCurrent)}
              data-testid={`role-change-option-${c.role}`}
              data-is-current={isCurrent ? 'true' : 'false'}
            >
              {isCurrent ? `${c.role} (current)` : c.role}
            </Button>
          );
        })}
      </div>
      {saved ? (
        <p
          role="status"
          data-testid="member-status-saved"
          className="text-sm text-accent-strong"
        >
          Saved
        </p>
      ) : null}
      {setStatus.error ? (
        <p
          role="alert"
          data-testid="member-status-error"
          className="text-sm text-red-700 dark:text-red-300"
        >
          That didn&apos;t save — try again.
        </p>
      ) : null}
    </div>
  );
}
