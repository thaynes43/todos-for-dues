import type { JobState } from '@app/db/schema';
import { stateDisplayName, formatChapterLocal } from '@/lib/formatters';

export interface AuditTransition {
  id: string;
  jobId: string;
  fromState: string | null;
  toState: string;
  actorId: string | null;
  actorKind: 'user' | 'system';
  actorDisplayName?: string | null;
  actorRole?: string | null;
  note: string | null;
  createdAt: Date | string;
}

function toDate(value: Date | string): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

function renderState(value: string | null): string {
  if (!value) return '∅';
  // States in the audit log are stored as snake_case; convert via the same
  // formatter the rest of the app uses.
  return stateDisplayName(value as JobState);
}

function renderActor(t: AuditTransition): string {
  if (t.actorKind === 'system') return 'system';
  if (t.actorDisplayName) {
    return t.actorRole
      ? `${t.actorDisplayName} (${t.actorRole})`
      : t.actorDisplayName;
  }
  return t.actorId ?? 'unknown';
}

export function AuditLogTable({
  transitions,
}: {
  transitions: ReadonlyArray<AuditTransition>;
}) {
  if (transitions.length === 0) {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="audit-log-table-empty"
      >
        No transitions recorded for this job.
      </p>
    );
  }

  return (
    <table
      className="w-full border-collapse text-sm"
      data-testid="audit-log-table"
    >
      <thead className="border-b bg-muted/40 text-left">
        <tr>
          <th className="px-3 py-2 font-medium">When</th>
          <th className="px-3 py-2 font-medium">Transition</th>
          <th className="px-3 py-2 font-medium">Actor</th>
          <th className="px-3 py-2 font-medium">Note</th>
        </tr>
      </thead>
      <tbody>
        {transitions.map((t) => {
          const d = toDate(t.createdAt);
          const iso = d.toISOString();
          return (
            <tr
              key={t.id}
              className="border-b align-top last:border-b-0"
              data-testid="audit-log-row"
              data-transition-id={t.id}
              data-to-state={t.toState}
            >
              <td className="px-3 py-2 whitespace-nowrap">
                <time dateTime={iso} title={iso}>
                  {formatChapterLocal(d)}
                </time>
              </td>
              <td className="px-3 py-2">
                <span data-testid="audit-log-from">
                  {renderState(t.fromState)}
                </span>
                {' → '}
                <span data-testid="audit-log-to">{renderState(t.toState)}</span>
              </td>
              <td className="px-3 py-2">{renderActor(t)}</td>
              <td className="px-3 py-2 whitespace-pre-line">{t.note ?? ''}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
