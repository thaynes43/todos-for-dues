'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';

export interface RosterEntry {
  activeId: string;
  displayName?: string;
}

export function CompleteJobForm({
  jobId,
  roster,
}: {
  jobId: string;
  roster: ReadonlyArray<RosterEntry>;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(roster.map((r) => [r.activeId, true])),
  );

  const complete = trpc.jobs.complete.useMutation({
    onSuccess: async () => {
      await utils.jobs.getById.invalidate({ jobId });
      router.refresh();
    },
  });

  const selectedIds = Object.entries(confirmed)
    .filter(([, on]) => on)
    .map(([id]) => id);
  const canSubmit = selectedIds.length >= 1 && !complete.isPending;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    complete.mutate({ jobId, confirmedAttendees: selectedIds });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3"
      data-testid="complete-job-form"
    >
      <p className="text-sm font-medium">Confirm attendees</p>
      <ul className="space-y-1">
        {roster.map((r) => (
          <li key={r.activeId}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-accent-strong"
                checked={confirmed[r.activeId] ?? false}
                onChange={(e) =>
                  setConfirmed((prev) => ({ ...prev, [r.activeId]: e.target.checked }))
                }
                data-testid={`complete-attendee-${r.activeId}`}
              />
              <span>{r.displayName ?? r.activeId}</span>
            </label>
          </li>
        ))}
      </ul>
      {complete.error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {complete.error.message}
        </p>
      ) : null}
      <Button type="submit" disabled={!canSubmit} data-testid="complete-job-submit">
        {complete.isPending ? 'Completing…' : 'Mark complete'}
      </Button>
    </form>
  );
}
