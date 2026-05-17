import Link from 'next/link';
import { ResolveDisputeModal } from './ResolveDisputeModal';

const TRUNCATE_AT = 100;

function truncate(value: string | null | undefined, limit = TRUNCATE_AT): string {
  if (!value) return '';
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

function formatAge(from: Date | string | null): string {
  if (!from) return '—';
  const d = typeof from === 'string' ? new Date(from) : from;
  if (Number.isNaN(d.getTime())) return '—';
  const elapsedMs = Date.now() - d.getTime();
  if (elapsedMs <= 0) return '0h';
  const hours = Math.floor(elapsedMs / 3_600_000);
  if (hours < 24) return `${Math.max(hours, 0)}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  if (remHours === 0) return `${days}d`;
  return `${days}d ${remHours}h`;
}

export interface DisputeRow {
  id: string;
  description: string;
  disputeReason: string | null;
  disputer: {
    id: string | null;
    displayName: string | null;
    role: string | null;
  } | null;
  disputedAt: Date | string | null;
}

export function DisputeCardList({ rows }: { rows: ReadonlyArray<DisputeRow> }) {
  if (rows.length === 0) {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="dispute-card-list-empty"
      >
        No jobs are currently disputed.
      </p>
    );
  }

  return (
    <ul className="space-y-3" data-testid="dispute-card-list">
      {rows.map((row) => (
        <li
          key={row.id}
          data-testid="dispute-card-row"
          data-job-id={row.id}
          className="rounded-lg border bg-card p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <Link
                href={`/admin/jobs/${row.id}`}
                className="block font-medium hover:underline"
                data-testid="dispute-card-link"
              >
                {truncate(row.description)}
              </Link>
              <p className="text-sm text-muted-foreground">
                Disputed by{' '}
                <strong className="text-foreground">
                  {row.disputer?.displayName ?? 'unknown'}
                </strong>
                {row.disputer?.role ? ` (${row.disputer.role})` : ''}
                {' · '}
                <span data-testid="dispute-card-age">{formatAge(row.disputedAt)}</span>
              </p>
              {row.disputeReason ? (
                <p
                  className="text-sm"
                  data-testid="dispute-card-reason"
                >
                  <span className="text-muted-foreground">Reason: </span>
                  {truncate(row.disputeReason)}
                </p>
              ) : null}
            </div>
            <ResolveDisputeModal jobId={row.id} />
          </div>
        </li>
      ))}
    </ul>
  );
}
