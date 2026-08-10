'use client';

import { useRouter } from 'next/navigation';
import type { Role } from '@app/db/schema';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';

const SELF_SERVICE_ROLES = ['Active', 'Alumni'] as const;
type SelfServiceRole = (typeof SELF_SERVICE_ROLES)[number];

export interface RoleDropdownOption {
  role: Role;
  isCurrent: boolean;
}

export function buildRoleOptions(currentRole: Role): RoleDropdownOption[] {
  const options: RoleDropdownOption[] = SELF_SERVICE_ROLES.map((r) => ({
    role: r,
    isCurrent: r === currentRole,
  }));
  if (currentRole === 'Moderator' || currentRole === 'Admin') {
    options.push({ role: currentRole, isCurrent: true });
  }
  return options;
}

export interface RoleChangeDropdownProps {
  currentRole: Role;
  onMinAdminError?: () => void;
  onSuccess?: () => void;
}

export function RoleChangeDropdown({
  currentRole,
  onMinAdminError,
  onSuccess,
}: RoleChangeDropdownProps) {
  const router = useRouter();
  const options = buildRoleOptions(currentRole);

  const changeRole = trpc.users.changeRole.useMutation({
    onSuccess: () => {
      router.refresh();
      onSuccess?.();
    },
    onError: (err) => {
      const appCode = (err.data as { appCode?: string } | undefined)?.appCode;
      if (appCode === 'MIN_ADMIN_INVARIANT_VIOLATED') {
        onMinAdminError?.();
      }
    },
  });

  const handleSelect = (target: Role, isCurrent: boolean) => {
    if (isCurrent) return;
    if (target !== 'Active' && target !== 'Alumni') return;
    changeRole.mutate({ toRole: target as SelfServiceRole });
  };

  const inlineError = (() => {
    if (!changeRole.error) return null;
    const appCode = (changeRole.error.data as { appCode?: string } | undefined)
      ?.appCode;
    if (appCode === 'MIN_ADMIN_INVARIANT_VIOLATED') return null;
    return changeRole.error.message;
  })();

  return (
    <div
      className="space-y-2"
      data-testid="role-change-dropdown"
      data-current-role={currentRole}
    >
      <div
        role="group"
        aria-label="Change your role"
        className="flex flex-wrap items-center gap-2"
      >
        {options.map((opt) => (
          <Button
            key={opt.role}
            type="button"
            variant={opt.isCurrent ? 'secondary' : 'neutral'}
            size="sm"
            disabled={opt.isCurrent || changeRole.isPending}
            onClick={() => handleSelect(opt.role, opt.isCurrent)}
            data-testid={`role-change-option-${opt.role}`}
            data-is-current={opt.isCurrent ? 'true' : 'false'}
          >
            {opt.isCurrent ? `${opt.role} (current)` : opt.role}
          </Button>
        ))}
      </div>
      {inlineError ? (
        <p
          role="alert"
          data-testid="role-change-error"
          className="text-sm text-red-700 dark:text-red-300"
        >
          {inlineError}
        </p>
      ) : null}
    </div>
  );
}
