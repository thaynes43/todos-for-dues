import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { Role } from '@app/db/schema';

/**
 * ADR-014 — <ProfileStatusSection> renders one of three paths from the
 * `memberStatus.get` state:
 *   - portal available → portal-backed Active/Alumni buttons (memberStatus.set)
 *   - portal unavailable → the pre-existing local RoleChangeDropdown fallback
 *   - no registry row → no control at all
 */

const setMutate = vi.fn();
const changeRoleMutate = vi.fn();
const setDataSpy = vi.fn();

const queryState = vi.hoisted(() => ({
  data: undefined as unknown,
  error: null as unknown,
  isPending: false,
}));

const setMutationOpts = vi.hoisted(() => ({
  onSuccess: undefined as ((data: unknown) => void) | undefined,
}));

/** Mutable mutation state so specs can pin the in-flight (isPending) UI. */
const setMutationState = vi.hoisted(() => ({ isPending: false }));

vi.mock('@/lib/trpc-client', () => ({
  trpc: {
    useUtils: () => ({
      memberStatus: {
        get: {
          setData: (_input: unknown, data: unknown) => setDataSpy(data),
        },
      },
    }),
    memberStatus: {
      get: {
        useQuery: () => ({ ...queryState }),
      },
      set: {
        useMutation: (opts: { onSuccess?: (data: unknown) => void }) => {
          setMutationOpts.onSuccess = opts.onSuccess;
          return {
            mutate: (input: unknown) => setMutate(input),
            isPending: setMutationState.isPending,
            error: null,
          };
        },
      },
    },
    users: {
      changeRole: {
        useMutation: () => ({
          mutate: (input: unknown) => changeRoleMutate(input),
          isPending: false,
          error: null,
        }),
      },
    },
  },
}));

import { ProfileStatusSection } from '@/app/profile/ProfileStatusSection';

beforeEach(() => {
  setMutate.mockClear();
  changeRoleMutate.mockClear();
  setDataSpy.mockClear();
  queryState.data = undefined;
  queryState.error = null;
  queryState.isPending = false;
  setMutationOpts.onSuccess = undefined;
  setMutationState.isPending = false;
});

describe('<ProfileStatusSection> — portal-backed path', () => {
  it('declared status drives the current marker; picking the other side PUTs it', () => {
    queryState.data = { kind: 'ok', status: 'active', role: 'Active' };
    render(<ProfileStatusSection role={'Active' as Role} />);

    expect(screen.getByTestId('profile-status-section')).toHaveAttribute(
      'data-portal',
      'on',
    );
    expect(screen.getByTestId('role-change-dropdown')).toHaveAttribute(
      'data-portal-backed',
      'true',
    );
    const current = screen.getByTestId('role-change-option-Active');
    expect(current).toBeDisabled();
    expect(current).toHaveTextContent(/Active \(current\)/);

    fireEvent.click(screen.getByTestId('role-change-option-Alumni'));
    expect(setMutate).toHaveBeenCalledWith({ status: 'alumni' });
    expect(changeRoleMutate).not.toHaveBeenCalled();
  });

  it('undeclared status pins the current marker to the app role', () => {
    queryState.data = { kind: 'undeclared', status: null, role: 'Alumni' };
    render(<ProfileStatusSection role={'Alumni' as Role} />);
    expect(screen.getByTestId('role-change-option-Alumni')).toBeDisabled();
    expect(screen.getByTestId('role-change-option-Active')).toBeEnabled();
  });

  it('an in-flight save disables both sides and drops extra clicks (double-click guard)', () => {
    queryState.data = { kind: 'ok', status: 'active', role: 'Active' };
    setMutationState.isPending = true;
    render(<ProfileStatusSection role={'Active' as Role} />);

    // While the PUT is in flight neither side is clickable…
    expect(screen.getByTestId('role-change-option-Active')).toBeDisabled();
    expect(screen.getByTestId('role-change-option-Alumni')).toBeDisabled();

    // …and even a click that slips through (e.g. dispatched programmatically)
    // is dropped by the handler guard — no second mutation.
    fireEvent.click(screen.getByTestId('role-change-option-Alumni'));
    expect(setMutate).not.toHaveBeenCalled();
  });

  it('back-and-forth flips keep the current marker on the freshly-saved side', () => {
    queryState.data = { kind: 'ok', status: 'active', role: 'Active' };
    const { rerender } = render(<ProfileStatusSection role={'Active' as Role} />);

    // Flip 1: Active → Alumni.
    fireEvent.click(screen.getByTestId('role-change-option-Alumni'));
    expect(setMutate).toHaveBeenNthCalledWith(1, { status: 'alumni' });
    act(() => {
      queryState.data = { kind: 'ok', status: 'alumni', role: 'Alumni' };
      setMutationOpts.onSuccess?.(queryState.data);
    });
    rerender(<ProfileStatusSection role={'Active' as Role} />);
    expect(screen.getByTestId('role-change-option-Alumni')).toBeDisabled();
    expect(screen.getByTestId('role-change-option-Active')).toBeEnabled();

    // Flip 2: Alumni → back to Active.
    fireEvent.click(screen.getByTestId('role-change-option-Active'));
    expect(setMutate).toHaveBeenNthCalledWith(2, { status: 'active' });
    act(() => {
      queryState.data = { kind: 'ok', status: 'active', role: 'Active' };
      setMutationOpts.onSuccess?.(queryState.data);
    });
    rerender(<ProfileStatusSection role={'Active' as Role} />);
    expect(screen.getByTestId('role-change-option-Active')).toBeDisabled();
    expect(screen.getByTestId('role-change-option-Alumni')).toBeEnabled();

    // Two flips → exactly two mutations, no doubles.
    expect(setMutate).toHaveBeenCalledTimes(2);
  });

  it('shows the one-word confirmation and refreshes the cache on save', () => {
    queryState.data = { kind: 'ok', status: 'active', role: 'Active' };
    render(<ProfileStatusSection role={'Active' as Role} />);
    const fresh = { kind: 'ok', status: 'alumni', role: 'Alumni' };
    act(() => {
      setMutationOpts.onSuccess?.(fresh);
    });
    expect(setDataSpy).toHaveBeenCalledWith(fresh);
    expect(screen.getByTestId('member-status-saved')).toHaveTextContent('Saved');
  });
});

describe('<ProfileStatusSection> — fallback + hidden paths', () => {
  it('portal unavailable falls back to the local users.changeRole control', () => {
    queryState.data = { kind: 'unavailable', status: null, role: 'Active' };
    render(<ProfileStatusSection role={'Active' as Role} />);

    expect(screen.getByTestId('profile-status-section')).toHaveAttribute(
      'data-portal',
      'off',
    );
    const dropdown = screen.getByTestId('role-change-dropdown');
    expect(dropdown).not.toHaveAttribute('data-portal-backed');

    fireEvent.click(screen.getByTestId('role-change-option-Alumni'));
    expect(changeRoleMutate).toHaveBeenCalledWith({ toRole: 'Alumni' });
    expect(setMutate).not.toHaveBeenCalled();
  });

  it('fallback control tracks the server-fresh role, not the stale query cache', () => {
    // BUG caught by e2e (PR #58 run 4caba7f): after a local users.changeRole
    // flip, router.refresh() updates the server-provided `role` prop but
    // nothing refetches memberStatus.get — `data.role` stays at the pre-flip
    // value. The fallback control must render from the prop, or it keeps the
    // old side "(current)"/disabled and wedges back-and-forth until reload.
    queryState.data = { kind: 'unavailable', status: null, role: 'Active' };
    const { rerender } = render(<ProfileStatusSection role={'Active' as Role} />);
    expect(screen.getByTestId('role-change-option-Active')).toBeDisabled();

    // Simulate the post-flip refresh: prop is fresh (Alumni), cache is stale.
    rerender(<ProfileStatusSection role={'Alumni' as Role} />);
    expect(screen.getByTestId('role-change-option-Alumni')).toBeDisabled();
    expect(screen.getByTestId('role-change-option-Alumni')).toHaveTextContent(
      /Alumni \(current\)/,
    );
    expect(screen.getByTestId('role-change-option-Active')).toBeEnabled();
  });

  it('a tRPC-level query error also falls back (never blocks the member)', () => {
    queryState.error = new Error('boom');
    render(<ProfileStatusSection role={'Active' as Role} />);
    expect(screen.getByTestId('profile-status-section')).toHaveAttribute(
      'data-portal',
      'error',
    );
    expect(screen.getByTestId('role-change-dropdown')).toBeInTheDocument();
  });

  it('no registry row hides the control entirely', () => {
    queryState.data = { kind: 'no-registry-row', status: null, role: 'Active' };
    render(<ProfileStatusSection role={'Active' as Role} />);
    expect(screen.getByTestId('profile-status-section')).toHaveAttribute(
      'data-portal',
      'no-registry-row',
    );
    expect(screen.queryByTestId('role-change-option-Active')).toBeNull();
    expect(screen.queryByTestId('role-change-option-Alumni')).toBeNull();
  });

  it('renders a quiet disabled placeholder while loading', () => {
    queryState.isPending = true;
    render(<ProfileStatusSection role={'Active' as Role} />);
    expect(screen.getByTestId('profile-status-section')).toHaveAttribute(
      'data-portal',
      'loading',
    );
    expect(screen.queryByTestId('role-change-option-Active')).toBeNull();
  });
});
