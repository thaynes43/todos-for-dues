import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  invalidate: vi.fn(),
  grantMutate: vi.fn(),
  listData: [] as Array<{
    id: string;
    displayName: string;
    email: string;
    role: 'Active' | 'Alumni' | 'Moderator' | 'Admin';
  }>,
  searchParams: new URLSearchParams(),
  grantOpts: {
    onSuccess: undefined as
      | ((data: unknown, variables: { targetUserId: string }) => void)
      | undefined,
    onError: undefined as
      | ((err: unknown, variables: { targetUserId: string }) => void)
      | undefined,
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => ({ get: (k: string) => mocks.searchParams.get(k) }),
}));

vi.mock('@/lib/trpc-client', () => ({
  trpc: {
    useUtils: () => ({
      users: { list: { invalidate: mocks.invalidate } },
    }),
    users: {
      list: {
        useQuery: () => ({
          data: mocks.listData,
          isLoading: false,
          error: null,
        }),
      },
      grantRole: {
        useMutation: (opts: {
          onSuccess?: (data: unknown, variables: { targetUserId: string }) => void;
          onError?: (err: unknown, variables: { targetUserId: string }) => void;
        }) => {
          mocks.grantOpts.onSuccess = opts.onSuccess;
          mocks.grantOpts.onError = opts.onError;
          return {
            mutate: (input: { targetUserId: string; toRole: string }) =>
              mocks.grantMutate(input),
            isPending: false,
            error: null,
          };
        },
      },
    },
  },
}));

import { UserListTable } from '@/components/UserListTable';

beforeEach(() => {
  mocks.push.mockClear();
  mocks.invalidate.mockClear();
  mocks.grantMutate.mockClear();
  mocks.listData = [];
  mocks.searchParams = new URLSearchParams();
  mocks.grantOpts.onSuccess = undefined;
  mocks.grantOpts.onError = undefined;
});

describe('<UserListTable>', () => {
  it('AC-08: renders one row per user with display name, email, role chip', () => {
    mocks.listData = [
      { id: 'u-1', displayName: 'Alice', email: 'a@x', role: 'Admin' },
      { id: 'u-2', displayName: 'Bob', email: 'b@x', role: 'Alumni' },
    ];
    render(<UserListTable />);
    const rows = screen.getAllByTestId('user-list-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]!).toHaveAttribute('data-user-id', 'u-1');
    expect(rows[0]!).toHaveTextContent('Alice');
    expect(rows[0]!).toHaveTextContent('a@x');
    expect(rows[1]!).toHaveAttribute('data-user-role', 'Alumni');
    expect(rows[1]!).toHaveTextContent('Bob');
  });

  it('clicking the role chip opens a menu of target roles (excluding current)', () => {
    mocks.listData = [
      { id: 'u-1', displayName: 'Alice', email: 'a@x', role: 'Alumni' },
    ];
    render(<UserListTable />);
    fireEvent.click(screen.getByTestId('user-list-role-chip'));
    expect(screen.getByTestId('user-list-role-menu')).toBeInTheDocument();
    expect(
      screen.getByTestId('user-list-role-option-Active'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('user-list-role-option-Moderator'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('user-list-role-option-Admin'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('user-list-role-option-Alumni'),
    ).not.toBeInTheDocument();
  });

  it('grant to non-Admin from non-Admin target fires mutate without confirm', () => {
    mocks.listData = [
      { id: 'u-1', displayName: 'Alice', email: 'a@x', role: 'Alumni' },
    ];
    render(<UserListTable />);
    fireEvent.click(screen.getByTestId('user-list-role-chip'));
    fireEvent.click(screen.getByTestId('user-list-role-option-Moderator'));
    expect(mocks.grantMutate).toHaveBeenCalledWith({
      targetUserId: 'u-1',
      toRole: 'Moderator',
    });
    expect(
      screen.queryByTestId('user-list-demote-confirm'),
    ).not.toBeInTheDocument();
  });

  it('demoting an Admin opens a confirm dialog before mutating', () => {
    mocks.listData = [
      { id: 'u-1', displayName: 'Alice', email: 'a@x', role: 'Admin' },
    ];
    render(<UserListTable />);
    fireEvent.click(screen.getByTestId('user-list-role-chip'));
    fireEvent.click(screen.getByTestId('user-list-role-option-Alumni'));
    expect(screen.getByTestId('user-list-demote-confirm')).toBeInTheDocument();
    expect(mocks.grantMutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('user-list-demote-confirm-submit'));
    expect(mocks.grantMutate).toHaveBeenCalledWith({
      targetUserId: 'u-1',
      toRole: 'Alumni',
    });
  });

  it('Cancel on the Admin-demote confirm dialog closes without mutating', () => {
    mocks.listData = [
      { id: 'u-1', displayName: 'Alice', email: 'a@x', role: 'Admin' },
    ];
    render(<UserListTable />);
    fireEvent.click(screen.getByTestId('user-list-role-chip'));
    fireEvent.click(screen.getByTestId('user-list-role-option-Active'));
    fireEvent.click(screen.getByTestId('user-list-demote-cancel'));
    expect(
      screen.queryByTestId('user-list-demote-confirm'),
    ).not.toBeInTheDocument();
    expect(mocks.grantMutate).not.toHaveBeenCalled();
  });

  it('renders MinAdminErrorBanner inline on MIN_ADMIN_INVARIANT_VIOLATED', () => {
    mocks.listData = [
      { id: 'u-1', displayName: 'Alice', email: 'a@x', role: 'Admin' },
    ];
    render(<UserListTable />);
    fireEvent.click(screen.getByTestId('user-list-role-chip'));
    fireEvent.click(screen.getByTestId('user-list-role-option-Alumni'));
    fireEvent.click(screen.getByTestId('user-list-demote-confirm-submit'));
    act(() => {
      mocks.grantOpts.onError?.(
        { data: { appCode: 'MIN_ADMIN_INVARIANT_VIOLATED' } },
        { targetUserId: 'u-1' },
      );
    });
    expect(screen.getByTestId('min-admin-error-banner')).toBeInTheDocument();
    expect(
      screen.getByTestId('min-admin-error-banner-link'),
    ).toBeInTheDocument();
  });

  it('redirects to the validated returnTo after a successful grant', async () => {
    mocks.searchParams = new URLSearchParams('returnTo=/profile');
    mocks.listData = [
      { id: 'u-1', displayName: 'Alice', email: 'a@x', role: 'Alumni' },
    ];
    render(<UserListTable />);
    fireEvent.click(screen.getByTestId('user-list-role-chip'));
    fireEvent.click(screen.getByTestId('user-list-role-option-Admin'));
    await act(async () => {
      await mocks.grantOpts.onSuccess?.(undefined, { targetUserId: 'u-1' });
    });
    expect(mocks.push).toHaveBeenCalledWith('/profile');
  });

  it('ignores an open-redirect returnTo (https:// or //evil)', async () => {
    mocks.searchParams = new URLSearchParams(
      'returnTo=https://evil.example.com',
    );
    mocks.listData = [
      { id: 'u-1', displayName: 'Alice', email: 'a@x', role: 'Alumni' },
    ];
    render(<UserListTable />);
    expect(
      screen.queryByTestId('user-list-return-banner'),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('user-list-role-chip'));
    fireEvent.click(screen.getByTestId('user-list-role-option-Admin'));
    await act(async () => {
      await mocks.grantOpts.onSuccess?.(undefined, { targetUserId: 'u-1' });
    });
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
