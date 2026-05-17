import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  historyData: [] as Array<{
    id: string;
    userId: string;
    fromRole: string | null;
    toRole: string;
    initiatorId: string | null;
    initiatorKind: 'user' | 'admin' | 'system';
    note: string | null;
    createdAt: Date;
  }>,
  isLoading: false,
  error: null as { message: string } | null,
}));

vi.mock('@/lib/trpc-client', () => ({
  trpc: {
    users: {
      getRoleHistory: {
        useQuery: () => ({
          data: mocks.historyData,
          isLoading: mocks.isLoading,
          error: mocks.error,
        }),
      },
    },
  },
}));

import { RoleChangeHistoryTable } from '@/components/RoleChangeHistoryTable';

beforeEach(() => {
  mocks.historyData = [];
  mocks.isLoading = false;
  mocks.error = null;
});

describe('<RoleChangeHistoryTable>', () => {
  it('renders an empty state when there are no transitions', () => {
    render(<RoleChangeHistoryTable userId="u-1" />);
    expect(screen.getByTestId('role-history-empty')).toBeInTheDocument();
  });

  it('AC-11: renders rows in descending order with from → to', () => {
    // Pre-sorted descending; the table renders rows in the order it receives.
    mocks.historyData = [
      {
        id: 't-3',
        userId: 'u-1',
        fromRole: 'Moderator',
        toRole: 'Admin',
        initiatorId: 'admin-1',
        initiatorKind: 'admin',
        note: null,
        createdAt: new Date('2026-05-15T10:00:00Z'),
      },
      {
        id: 't-2',
        userId: 'u-1',
        fromRole: 'Alumni',
        toRole: 'Moderator',
        initiatorId: 'admin-1',
        initiatorKind: 'admin',
        note: null,
        createdAt: new Date('2026-05-14T10:00:00Z'),
      },
      {
        id: 't-1',
        userId: 'u-1',
        fromRole: 'Active',
        toRole: 'Alumni',
        initiatorId: 'u-1',
        initiatorKind: 'user',
        note: null,
        createdAt: new Date('2026-05-13T10:00:00Z'),
      },
    ];
    render(<RoleChangeHistoryTable userId="u-1" />);
    const rows = screen.getAllByTestId('role-history-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]!).toHaveAttribute('data-transition-id', 't-3');
    expect(rows[1]!).toHaveAttribute('data-transition-id', 't-2');
    expect(rows[2]!).toHaveAttribute('data-transition-id', 't-1');
  });

  it('renders "system" when initiatorKind is system', () => {
    mocks.historyData = [
      {
        id: 't-x',
        userId: 'u-1',
        fromRole: null,
        toRole: 'Admin',
        initiatorId: null,
        initiatorKind: 'system',
        note: 'bootstrap',
        createdAt: new Date('2026-05-12T10:00:00Z'),
      },
    ];
    render(<RoleChangeHistoryTable userId="u-1" />);
    expect(screen.getByTestId('role-history-initiator')).toHaveTextContent(
      'system',
    );
  });

  it('puts UTC ISO in the <time datetime> attribute and tooltip', () => {
    const SAMPLE = new Date('2026-05-15T10:00:00.123Z');
    mocks.historyData = [
      {
        id: 't-1',
        userId: 'u-1',
        fromRole: 'Active',
        toRole: 'Alumni',
        initiatorId: 'u-1',
        initiatorKind: 'user',
        note: null,
        createdAt: SAMPLE,
      },
    ];
    render(<RoleChangeHistoryTable userId="u-1" />);
    const time = screen
      .getByTestId('role-history-row')
      .querySelector('time')!;
    expect(time.getAttribute('datetime')).toBe(SAMPLE.toISOString());
    expect(time.getAttribute('title')).toBe(SAMPLE.toISOString());
  });

  it('does not render any edit / delete affordance (read-only per PRD-008 §6)', () => {
    mocks.historyData = [
      {
        id: 't-1',
        userId: 'u-1',
        fromRole: 'Active',
        toRole: 'Alumni',
        initiatorId: 'u-1',
        initiatorKind: 'user',
        note: null,
        createdAt: new Date('2026-05-15T10:00:00Z'),
      },
    ];
    render(<RoleChangeHistoryTable userId="u-1" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
