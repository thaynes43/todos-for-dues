import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/lib/trpc-client', () => {
  const stubMutation = () => ({
    useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  });
  return {
    trpc: {
      useUtils: () => ({
        invites: { list: { invalidate: vi.fn() } },
      }),
      invites: {
        list: {
          useQuery: (
            _input: undefined,
            opts?: { initialData?: unknown },
          ) => ({
            data: opts?.initialData,
            isLoading: false,
            error: null,
          }),
        },
        mint: stubMutation(),
        revoke: stubMutation(),
      },
    },
  };
});

import { InviteList, type InviteRow } from '@/components/InviteList';

const BASE_URL = 'https://todos-for-dues.haynesops.com';

function row(over: Partial<InviteRow> = {}): InviteRow {
  return {
    id: over.id ?? 'inv-1',
    token: over.token ?? 'tok-1234',
    preselectedRole: over.preselectedRole ?? 'Active',
    createdAt: over.createdAt ?? '2026-05-17T12:00:00.000Z',
    // Explicitly honour null overrides (null fallback test).
    createdByDisplayName:
      'createdByDisplayName' in over
        ? (over.createdByDisplayName ?? null)
        : 'Alice Admin',
  };
}

describe('<InviteList>', () => {
  it('renders the empty-state copy when there are no invites', () => {
    render(<InviteList initialInvites={[]} baseUrl={BASE_URL} />);
    const empty = screen.getByTestId('invite-list-empty');
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).toMatch(/No outstanding invites/i);
    // Mint button is still visible in the header even when empty.
    expect(screen.getByTestId('mint-invite-button')).toBeInTheDocument();
    expect(screen.queryByTestId('invite-list')).not.toBeInTheDocument();
  });

  it('renders one row per outstanding invite with role chip + minter + URL', () => {
    const rows = [
      row({ id: 'i-1', token: 'aaa', preselectedRole: 'Active' }),
      row({
        id: 'i-2',
        token: 'bbb',
        preselectedRole: 'Alumni',
        createdByDisplayName: 'Bob Boss',
      }),
      row({
        id: 'i-3',
        token: 'ccc',
        preselectedRole: 'Active',
        createdByDisplayName: null,
      }),
    ];
    render(<InviteList initialInvites={rows} baseUrl={BASE_URL} />);
    const all = screen.getAllByTestId('invite-list-row');
    expect(all).toHaveLength(3);

    // Row 1 — Active, Alice
    const r1 = all[0]!;
    expect(r1).toHaveAttribute('data-invite-id', 'i-1');
    expect(r1).toHaveAttribute('data-invite-token', 'aaa');
    expect(within(r1).getByTestId('invite-list-role-chip')).toHaveTextContent('Active');
    expect(within(r1).getByTestId('invite-list-minter')).toHaveTextContent('Alice Admin');

    // Row 2 — Alumni, Bob
    const r2 = all[1]!;
    expect(within(r2).getByTestId('invite-list-role-chip')).toHaveTextContent('Alumni');
    expect(within(r2).getByTestId('invite-list-minter')).toHaveTextContent('Bob Boss');

    // Row 3 — null display name falls back to 'Unknown'
    const r3 = all[2]!;
    expect(within(r3).getByTestId('invite-list-minter')).toHaveTextContent('Unknown');
  });

  it('builds the signup URL as `${baseUrl}/signup?token=${token}`', () => {
    const rows = [row({ id: 'i-1', token: 'tok-xyz' })];
    render(<InviteList initialInvites={rows} baseUrl={BASE_URL} />);
    const input = screen.getByTestId('invite-list-url') as HTMLInputElement;
    expect(input.value).toBe(`${BASE_URL}/signup?token=tok-xyz`);
  });

  it('renders Copy + Revoke buttons per row', () => {
    const rows = [row({ id: 'i-1', token: 'tok-1' })];
    render(<InviteList initialInvites={rows} baseUrl={BASE_URL} />);
    const r = screen.getByTestId('invite-list-row');
    expect(within(r).getByTestId('invite-list-copy')).toBeInTheDocument();
    expect(within(r).getByTestId('revoke-invite-button')).toBeInTheDocument();
  });
});
