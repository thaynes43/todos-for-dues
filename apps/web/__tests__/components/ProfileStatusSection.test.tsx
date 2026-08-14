import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

type MemberStatus = 'active' | 'alumni';
type View = { available: true; status: MemberStatus | null } | { available: false };

const mutate = vi.fn();
const invalidate = vi.fn();
const setData = vi.fn();

const queryState = vi.hoisted(() => ({
  data: undefined as unknown,
  isFetching: false,
}));
const mutationState = vi.hoisted(() => ({
  isPending: false,
  error: null as unknown,
}));
const mutationOpts = vi.hoisted(() => ({
  onSuccess: undefined as ((view: unknown) => void) | undefined,
  onError: undefined as ((err: unknown) => void) | undefined,
}));

vi.mock('@/lib/trpc-client', () => ({
  trpc: {
    useUtils: () => ({
      memberStatus: { get: { invalidate, setData } },
    }),
    memberStatus: {
      get: {
        useQuery: () => ({
          data: queryState.data,
          isFetching: queryState.isFetching,
        }),
      },
      set: {
        useMutation: (opts: {
          onSuccess?: (view: unknown) => void;
          onError?: (err: unknown) => void;
        }) => {
          mutationOpts.onSuccess = opts.onSuccess;
          mutationOpts.onError = opts.onError;
          return {
            mutate: (input: unknown) => mutate(input),
            isPending: mutationState.isPending,
            error: mutationState.error,
          };
        },
      },
    },
  },
}));

import { ProfileStatusSection } from '@/app/profile/ProfileStatusSection';

beforeEach(() => {
  mutate.mockClear();
  invalidate.mockClear();
  setData.mockClear();
  queryState.data = undefined;
  queryState.isFetching = false;
  mutationState.isPending = false;
  mutationState.error = null;
  mutationOpts.onSuccess = undefined;
  mutationOpts.onError = undefined;
});

describe('<ProfileStatusSection> — visibility (feature detection)', () => {
  it('hidden while loading with no claim snapshot (today: portal API not built)', () => {
    const { container } = render(<ProfileStatusSection initialStatus={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('hidden when the read says unavailable, even with a claim snapshot', () => {
    queryState.data = { available: false } satisfies View;
    const { container } = render(<ProfileStatusSection initialStatus="active" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('claim snapshot preselects while the first read is in flight', () => {
    queryState.data = undefined;
    render(<ProfileStatusSection initialStatus="alumni" />);
    const alumni = screen.getByTestId('member-status-option-alumni');
    expect(alumni).toHaveAttribute('data-is-current', 'true');
    // Not interactive until the read confirms availability.
    expect(screen.getByTestId('member-status-option-active')).toBeDisabled();
  });

  it('visible when the read confirms availability', () => {
    queryState.data = { available: true, status: 'active' } satisfies View;
    render(<ProfileStatusSection initialStatus={null} />);
    expect(screen.getByTestId('profile-status-section')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });
});

describe('<ProfileStatusSection> — control state', () => {
  it('current status is marked and disabled; the other is clickable', () => {
    queryState.data = { available: true, status: 'active' } satisfies View;
    render(<ProfileStatusSection initialStatus={null} />);
    const active = screen.getByTestId('member-status-option-active');
    const alumni = screen.getByTestId('member-status-option-alumni');
    expect(active).toBeDisabled();
    expect(active).toHaveAttribute('data-is-current', 'true');
    expect(alumni).toBeEnabled();
    expect(alumni).toHaveAttribute('data-is-current', 'false');
  });

  it('undeclared (status null): both options are clickable, none current', () => {
    queryState.data = { available: true, status: null } satisfies View;
    render(<ProfileStatusSection initialStatus={null} />);
    expect(screen.getByTestId('member-status-option-active')).toBeEnabled();
    expect(screen.getByTestId('member-status-option-alumni')).toBeEnabled();
  });

  it('clicking an option submits the contract value', () => {
    queryState.data = { available: true, status: 'active' } satisfies View;
    render(<ProfileStatusSection initialStatus={null} />);
    fireEvent.click(screen.getByTestId('member-status-option-alumni'));
    expect(mutate).toHaveBeenCalledWith({ status: 'alumni' });
  });
});

describe('<ProfileStatusSection> — after save', () => {
  it('success: updates the cached view from the re-read and confirms "Saved."', () => {
    queryState.data = { available: true, status: 'active' } satisfies View;
    render(<ProfileStatusSection initialStatus={null} />);
    const fresh: View = { available: true, status: 'alumni' };
    act(() => {
      mutationOpts.onSuccess?.(fresh);
    });
    expect(setData).toHaveBeenCalledWith(undefined, fresh);
    expect(screen.getByTestId('member-status-saved')).toHaveTextContent('Saved.');
  });

  it('failure: refetches availability so a vanished feature hides itself', () => {
    queryState.data = { available: true, status: 'active' } satisfies View;
    render(<ProfileStatusSection initialStatus={null} />);
    act(() => {
      mutationOpts.onError?.({ data: { code: 'NOT_FOUND' } });
    });
    expect(invalidate).toHaveBeenCalled();
    // No error copy for the hide-the-control case.
    expect(screen.queryByTestId('member-status-error')).not.toBeInTheDocument();
  });

  it('transient failure shows terse retry copy', () => {
    queryState.data = { available: true, status: 'active' } satisfies View;
    mutationState.error = { data: { code: 'SERVICE_UNAVAILABLE' } };
    render(<ProfileStatusSection initialStatus={null} />);
    expect(screen.getByTestId('member-status-error')).toHaveTextContent('Try again.');
  });
});
