import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuditLogTable } from '@/components/AuditLogTable';

const SAMPLE_DATE = new Date('2026-06-02T14:22:11.392Z');

describe('<AuditLogTable>', () => {
  it('renders an empty state when no transitions', () => {
    render(<AuditLogTable transitions={[]} />);
    expect(screen.getByTestId('audit-log-table-empty')).toBeInTheDocument();
  });

  it('renders one row per transition in array order', () => {
    render(
      <AuditLogTable
        transitions={[
          {
            id: 't-1',
            jobId: 'j-1',
            fromState: null,
            toState: 'awaiting_moderation',
            actorId: 'u-1',
            actorKind: 'user',
            actorDisplayName: 'Alice',
            actorRole: 'Alumni',
            note: 'posted',
            createdAt: SAMPLE_DATE,
          },
          {
            id: 't-2',
            jobId: 'j-1',
            fromState: 'awaiting_moderation',
            toState: 'enrollment_open',
            actorId: null,
            actorKind: 'system',
            actorDisplayName: null,
            actorRole: null,
            note: null,
            createdAt: SAMPLE_DATE,
          },
        ]}
      />,
    );
    const rows = screen.getAllByTestId('audit-log-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]!).toHaveAttribute('data-transition-id', 't-1');
    expect(rows[1]!).toHaveAttribute('data-transition-id', 't-2');
  });

  it('puts UTC ISO into the <time dateTime> attribute and tooltip', () => {
    render(
      <AuditLogTable
        transitions={[
          {
            id: 't-1',
            jobId: 'j-1',
            fromState: 'enrollment_open',
            toState: 'locked',
            actorId: 'u-1',
            actorKind: 'user',
            actorDisplayName: 'Alice',
            actorRole: 'Alumni',
            note: null,
            createdAt: SAMPLE_DATE,
          },
        ]}
      />,
    );
    const time = screen.getByTestId('audit-log-row').querySelector('time')!;
    expect(time.getAttribute('datetime')).toBe(SAMPLE_DATE.toISOString());
    expect(time.getAttribute('title')).toBe(SAMPLE_DATE.toISOString());
  });

  it('renders the actor display name + role for user actors', () => {
    render(
      <AuditLogTable
        transitions={[
          {
            id: 't-1',
            jobId: 'j-1',
            fromState: 'payment_sent',
            toState: 'disputed',
            actorId: 'u-1',
            actorKind: 'user',
            actorDisplayName: 'Alice Adams',
            actorRole: 'Active',
            note: null,
            createdAt: SAMPLE_DATE,
          },
        ]}
      />,
    );
    expect(screen.getByTestId('audit-log-row')).toHaveTextContent(
      'Alice Adams',
    );
    expect(screen.getByTestId('audit-log-row')).toHaveTextContent('(Active)');
  });

  it('renders "system" when actorKind is system', () => {
    render(
      <AuditLogTable
        transitions={[
          {
            id: 't-3',
            jobId: 'j-1',
            fromState: 'approved',
            toState: 'enrollment_open',
            actorId: null,
            actorKind: 'system',
            actorDisplayName: null,
            actorRole: null,
            note: null,
            createdAt: SAMPLE_DATE,
          },
        ]}
      />,
    );
    expect(screen.getByTestId('audit-log-row')).toHaveTextContent('system');
  });

  it('renders the from → to transition with display state names', () => {
    render(
      <AuditLogTable
        transitions={[
          {
            id: 't-x',
            jobId: 'j-1',
            fromState: 'payment_sent',
            toState: 'closed',
            actorId: 'u-1',
            actorKind: 'user',
            actorDisplayName: 'Alice',
            actorRole: 'Active',
            note: null,
            createdAt: SAMPLE_DATE,
          },
        ]}
      />,
    );
    expect(screen.getByTestId('audit-log-from')).toHaveTextContent(
      'payment-sent',
    );
    expect(screen.getByTestId('audit-log-to')).toHaveTextContent('closed');
  });
});
