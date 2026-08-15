import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Role } from '@app/db/schema';

/**
 * ADR-015: <UserListTable> is READ-ONLY. Roles are portal-derived only — the
 * self-service/admin role writers (users.grantRole / users.changeRole) were
 * removed with the orthogonality ruling. This table renders the roster and its
 * portal note; it never exposes a role dropdown, chip menu, or demote modal,
 * and it never mutates a role. The mock therefore only wires `users.list`.
 */

const listState = vi.hoisted(() => ({
  data: [] as Array<{
    id: string;
    displayName: string;
    email: string;
    role: Role;
  }>,
  isLoading: false,
  error: null as { message: string } | null,
}));

vi.mock('@/lib/trpc-client', () => ({
  trpc: {
    users: {
      list: {
        useQuery: () => ({ ...listState }),
      },
    },
  },
}));

import { UserListTable } from '@/components/UserListTable';

beforeEach(() => {
  listState.data = [];
  listState.isLoading = false;
  listState.error = null;
});

describe('<UserListTable> (read-only roster)', () => {
  it('AC-08: renders the portal note and one row per user with name, email, role pill', () => {
    listState.data = [
      { id: 'u-1', displayName: 'Alice', email: 'a@x', role: 'Admin' },
      { id: 'u-2', displayName: 'Bob', email: 'b@x', role: 'Member' },
    ];
    render(<UserListTable />);

    expect(
      screen.getByTestId('user-list-portal-note'),
    ).toBeInTheDocument();

    const rows = screen.getAllByTestId('user-list-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]!).toHaveAttribute('data-user-id', 'u-1');
    expect(rows[0]!).toHaveAttribute('data-user-role', 'Admin');
    expect(rows[0]!).toHaveTextContent('Alice');
    expect(rows[0]!).toHaveTextContent('a@x');
    expect(rows[1]!).toHaveAttribute('data-user-role', 'Member');
    expect(rows[1]!).toHaveTextContent('Bob');

    // Display-name links to the per-user page; role renders as a static pill.
    const names = screen.getAllByTestId('user-list-display-name');
    expect(names[0]!).toHaveAttribute('href', '/admin/users/u-1');
    const pills = screen.getAllByTestId('user-list-role');
    expect(pills.map((p) => p.textContent)).toEqual(['Admin', 'Member']);
  });

  it('exposes NO role-change surface — no chip menu, options, or demote modal', () => {
    listState.data = [
      { id: 'u-1', displayName: 'Alice', email: 'a@x', role: 'Admin' },
      { id: 'u-2', displayName: 'Bob', email: 'b@x', role: 'Moderator' },
    ];
    render(<UserListTable />);

    // The role cell is a plain pill, not an interactive chip/button.
    const pill = screen.getAllByTestId('user-list-role')[0]!;
    expect(pill.tagName).toBe('SPAN');

    expect(screen.queryByTestId('user-list-role-chip')).toBeNull();
    expect(screen.queryByTestId('user-list-role-menu')).toBeNull();
    for (const role of ['Member', 'Moderator', 'Admin'] as const) {
      expect(
        screen.queryByTestId(`user-list-role-option-${role}`),
      ).toBeNull();
    }
    expect(screen.queryByTestId('user-list-demote-confirm')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows a loading state while users.list is pending', () => {
    listState.isLoading = true;
    render(<UserListTable />);
    expect(screen.getByTestId('users-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('user-list-row')).toBeNull();
  });

  it('surfaces a query error', () => {
    listState.error = { message: 'boom' };
    render(<UserListTable />);
    const err = screen.getByTestId('users-error');
    expect(err).toHaveTextContent('boom');
    expect(screen.queryByTestId('user-list-row')).toBeNull();
  });
});
