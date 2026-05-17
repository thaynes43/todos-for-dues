import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { Role } from '@app/db/schema';

const refresh = vi.fn();
const mutate = vi.fn();

const mutationOpts = vi.hoisted(() => ({
  onSuccess: undefined as ((data: unknown) => void) | undefined,
  onError: undefined as ((err: unknown) => void) | undefined,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock('@/lib/trpc-client', () => ({
  trpc: {
    users: {
      changeRole: {
        useMutation: (opts: {
          onSuccess?: (data: unknown) => void;
          onError?: (err: unknown) => void;
        }) => {
          mutationOpts.onSuccess = opts.onSuccess;
          mutationOpts.onError = opts.onError;
          return {
            mutate: (input: unknown) => mutate(input),
            isPending: false,
            error: null,
          };
        },
      },
    },
  },
}));

import {
  RoleChangeDropdown,
  buildRoleOptions,
} from '@/components/RoleChangeDropdown';

beforeEach(() => {
  refresh.mockClear();
  mutate.mockClear();
  mutationOpts.onSuccess = undefined;
  mutationOpts.onError = undefined;
});

describe('buildRoleOptions — PRD-008 §6 self-service filter', () => {
  it('AC-09: Active viewer sees only Active (current) + Alumni', () => {
    const opts = buildRoleOptions('Active');
    expect(opts).toEqual([
      { role: 'Active', isCurrent: true },
      { role: 'Alumni', isCurrent: false },
    ]);
  });

  it('Alumni viewer sees Active + Alumni (current)', () => {
    const opts = buildRoleOptions('Alumni');
    expect(opts).toEqual([
      { role: 'Active', isCurrent: false },
      { role: 'Alumni', isCurrent: true },
    ]);
  });

  it('AC-10: Moderator viewer sees Active + Alumni + Moderator (current)', () => {
    const opts = buildRoleOptions('Moderator');
    expect(opts).toEqual([
      { role: 'Active', isCurrent: false },
      { role: 'Alumni', isCurrent: false },
      { role: 'Moderator', isCurrent: true },
    ]);
  });

  it('Admin viewer sees Active + Alumni + Admin (current)', () => {
    const opts = buildRoleOptions('Admin');
    expect(opts).toEqual([
      { role: 'Active', isCurrent: false },
      { role: 'Alumni', isCurrent: false },
      { role: 'Admin', isCurrent: true },
    ]);
  });

  it('AC-03: never renders Moderator or Admin as a non-current target', () => {
    for (const r of ['Active', 'Alumni', 'Moderator', 'Admin'] as const) {
      const opts = buildRoleOptions(r);
      const targetable = opts.filter((o) => !o.isCurrent);
      for (const o of targetable) {
        expect(o.role === 'Moderator' || o.role === 'Admin').toBe(false);
      }
    }
  });
});

describe('<RoleChangeDropdown> — interaction', () => {
  it('selecting a non-current option calls users.changeRole with the toRole', () => {
    render(<RoleChangeDropdown currentRole={'Active' as Role} />);
    fireEvent.click(screen.getByTestId('role-change-option-Alumni'));
    expect(mutate).toHaveBeenCalledWith({ toRole: 'Alumni' });
  });

  it('selecting the current role is a no-op (button is disabled)', () => {
    render(<RoleChangeDropdown currentRole={'Active' as Role} />);
    const current = screen.getByTestId('role-change-option-Active');
    expect(current).toBeDisabled();
    expect(current).toHaveAttribute('data-is-current', 'true');
  });

  it('calls onMinAdminError when error is MIN_ADMIN_INVARIANT_VIOLATED', () => {
    const onMinAdminError = vi.fn();
    render(
      <RoleChangeDropdown
        currentRole={'Admin' as Role}
        onMinAdminError={onMinAdminError}
      />,
    );
    act(() => {
      mutationOpts.onError?.({
        data: { appCode: 'MIN_ADMIN_INVARIANT_VIOLATED' },
      });
    });
    expect(onMinAdminError).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onMinAdminError for unrelated errors', () => {
    const onMinAdminError = vi.fn();
    render(
      <RoleChangeDropdown
        currentRole={'Admin' as Role}
        onMinAdminError={onMinAdminError}
      />,
    );
    act(() => {
      mutationOpts.onError?.({
        data: { appCode: 'SOMETHING_ELSE' },
      });
    });
    expect(onMinAdminError).not.toHaveBeenCalled();
  });

  it('refreshes the router on success (session role staleness fix)', () => {
    render(<RoleChangeDropdown currentRole={'Admin' as Role} />);
    act(() => {
      mutationOpts.onSuccess?.(undefined);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('Admin viewer cannot target Moderator or Admin (only "(current)" entry)', () => {
    render(<RoleChangeDropdown currentRole={'Admin' as Role} />);
    expect(
      screen.queryByTestId('role-change-option-Moderator'),
    ).not.toBeInTheDocument();
    const adminButton = screen.getByTestId('role-change-option-Admin');
    expect(adminButton).toBeDisabled();
    expect(adminButton).toHaveTextContent(/Admin \(current\)/);
  });
});
