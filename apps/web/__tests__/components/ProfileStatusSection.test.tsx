import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

/**
 * ADR-015 — <ProfileStatusSection> takes NO props and is FULLY ORTHOGONAL to
 * role. It renders solely from the `memberStatus.get` state and only ever
 * writes STATUS via `memberStatus.set` — there is no RoleChangeDropdown
 * fallback and no role mutation anywhere (the mock deliberately wires no role
 * procedure, so any attempted role write would throw). Response shape is
 * `{ kind, status }` with NO role field.
 *
 * kinds: ok / undeclared → the Active/Alumni toggle; no-registry-row → hidden
 * control; unavailable → an off note; plus loading and query-error paths.
 */

const setMutate = vi.fn();
const setDataSpy = vi.fn();

const queryState = vi.hoisted(() => ({
  data: undefined as unknown,
  error: null as unknown,
  isPending: false,
}));

const setMutationOpts = vi.hoisted(() => ({
  onSuccess: undefined as ((data: unknown) => void) | undefined,
}));

/** Mutable mutation state so specs can pin the in-flight / error UI. */
const setMutationState = vi.hoisted(() => ({
  isPending: false,
  error: null as unknown,
}));

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
            error: setMutationState.error,
          };
        },
      },
    },
  },
}));

import { ProfileStatusSection } from '@/app/profile/ProfileStatusSection';

beforeEach(() => {
  setMutate.mockClear();
  setDataSpy.mockClear();
  queryState.data = undefined;
  queryState.error = null;
  queryState.isPending = false;
  setMutationOpts.onSuccess = undefined;
  setMutationState.isPending = false;
  setMutationState.error = null;
});

describe('<ProfileStatusSection> — the status toggle (ok / undeclared)', () => {
  it('ok(active) marks Active as current and Alumni as switchable', () => {
    queryState.data = { kind: 'ok', status: 'active' };
    render(<ProfileStatusSection />);

    const section = screen.getByTestId('member-status-section');
    expect(section).toHaveAttribute('data-portal', 'on');
    expect(section).toHaveAttribute('data-current-status', 'active');

    const active = screen.getByTestId('member-status-option-active');
    expect(active).toHaveAttribute('data-is-current', 'true');
    expect(active).toHaveTextContent(/Active \(current\)/);
    expect(active).toBeDisabled();

    const alumni = screen.getByTestId('member-status-option-alumni');
    expect(alumni).toHaveAttribute('data-is-current', 'false');
    expect(alumni).toHaveTextContent('Alumni');
    expect(alumni).toBeEnabled();

    // Current status is declared, so no "pick a side" prompt.
    expect(screen.queryByTestId('member-status-undeclared')).toBeNull();
  });

  it('ok(alumni) marks Alumni as current and Active as switchable', () => {
    queryState.data = { kind: 'ok', status: 'alumni' };
    render(<ProfileStatusSection />);

    expect(screen.getByTestId('member-status-section')).toHaveAttribute(
      'data-current-status',
      'alumni',
    );
    const alumni = screen.getByTestId('member-status-option-alumni');
    expect(alumni).toHaveAttribute('data-is-current', 'true');
    expect(alumni).toHaveTextContent(/Alumni \(current\)/);
    expect(alumni).toBeDisabled();
    expect(screen.getByTestId('member-status-option-active')).toBeEnabled();
  });

  it('undeclared marks neither side current and shows the pick-a-side prompt', () => {
    queryState.data = { kind: 'undeclared', status: null };
    render(<ProfileStatusSection />);

    expect(screen.getByTestId('member-status-section')).toHaveAttribute(
      'data-current-status',
      'none',
    );
    expect(screen.getByTestId('member-status-undeclared')).toBeInTheDocument();
    expect(screen.getByTestId('member-status-option-active')).toHaveAttribute(
      'data-is-current',
      'false',
    );
    expect(screen.getByTestId('member-status-option-alumni')).toHaveAttribute(
      'data-is-current',
      'false',
    );
    expect(screen.getByTestId('member-status-option-active')).toBeEnabled();
    expect(screen.getByTestId('member-status-option-alumni')).toBeEnabled();
  });

  it('clicking a non-current option PUTs that STATUS — and never a role', () => {
    queryState.data = { kind: 'ok', status: 'active' };
    render(<ProfileStatusSection />);

    fireEvent.click(screen.getByTestId('member-status-option-alumni'));
    expect(setMutate).toHaveBeenCalledTimes(1);
    const arg = setMutate.mock.calls[0]![0] as Record<string, unknown>;
    // Orthogonality: the payload carries ONLY a status, never a role field.
    expect(arg).toEqual({ status: 'alumni' });
    expect(Object.keys(arg)).toEqual(['status']);
  });

  it('clicking the already-current option is a no-op (no mutation)', () => {
    queryState.data = { kind: 'ok', status: 'active' };
    render(<ProfileStatusSection />);
    fireEvent.click(screen.getByTestId('member-status-option-active'));
    expect(setMutate).not.toHaveBeenCalled();
  });

  it('an in-flight save disables both sides and drops extra clicks', () => {
    queryState.data = { kind: 'ok', status: 'active' };
    setMutationState.isPending = true;
    render(<ProfileStatusSection />);

    expect(screen.getByTestId('member-status-option-active')).toBeDisabled();
    expect(screen.getByTestId('member-status-option-alumni')).toBeDisabled();

    fireEvent.click(screen.getByTestId('member-status-option-alumni'));
    expect(setMutate).not.toHaveBeenCalled();
  });

  it('a successful save refreshes the cache and shows the one-word confirmation', () => {
    queryState.data = { kind: 'ok', status: 'active' };
    render(<ProfileStatusSection />);

    const fresh = { kind: 'ok', status: 'alumni' };
    act(() => {
      setMutationOpts.onSuccess?.(fresh);
    });
    expect(setDataSpy).toHaveBeenCalledWith(fresh);
    expect(screen.getByTestId('member-status-saved')).toHaveTextContent('Saved');
  });

  it('surfaces a set error without touching any role control', () => {
    queryState.data = { kind: 'ok', status: 'active' };
    setMutationState.error = new Error('nope');
    render(<ProfileStatusSection />);
    expect(screen.getByTestId('member-status-error')).toBeInTheDocument();
    // Still only the status toggle — never a role dropdown.
    expect(screen.queryByTestId('role-change-dropdown')).toBeNull();
  });
});

describe('<ProfileStatusSection> — hidden / unavailable / loading / error', () => {
  it('no-registry-row renders only the empty control-hidden marker', () => {
    queryState.data = { kind: 'no-registry-row', status: null };
    render(<ProfileStatusSection />);

    const section = screen.getByTestId('member-status-section');
    expect(section).toHaveAttribute('data-portal', 'no-registry-row');
    expect(section).toBeEmptyDOMElement();
    expect(screen.queryByTestId('member-status-option-active')).toBeNull();
    expect(screen.queryByTestId('member-status-option-alumni')).toBeNull();
  });

  it('unavailable shows the off note and no toggle (no local fallback)', () => {
    queryState.data = { kind: 'unavailable', status: null };
    render(<ProfileStatusSection />);

    expect(screen.getByTestId('member-status-section')).toHaveAttribute(
      'data-portal',
      'off',
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByTestId('member-status-option-active')).toBeNull();
    expect(screen.queryByTestId('member-status-option-alumni')).toBeNull();
    expect(screen.queryByTestId('role-change-dropdown')).toBeNull();
  });

  it('renders a quiet disabled placeholder while loading', () => {
    queryState.isPending = true;
    render(<ProfileStatusSection />);
    expect(screen.getByTestId('member-status-section')).toHaveAttribute(
      'data-portal',
      'loading',
    );
    expect(screen.queryByTestId('member-status-option-active')).toBeNull();
  });

  it('a query error shows the terse error note (never a role control)', () => {
    queryState.error = new Error('boom');
    render(<ProfileStatusSection />);
    expect(screen.getByTestId('member-status-section')).toHaveAttribute(
      'data-portal',
      'error',
    );
    expect(screen.queryByTestId('member-status-option-active')).toBeNull();
    expect(screen.queryByTestId('role-change-dropdown')).toBeNull();
  });
});
