'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function LockJobForm({
  jobId,
  enrolleeCount,
}: {
  jobId: string;
  enrolleeCount: number;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [workDate, setWorkDate] = useState('');

  const lock = trpc.jobs.lock.useMutation({
    onSuccess: async () => {
      await utils.jobs.getById.invalidate({ jobId });
      router.refresh();
    },
  });

  // MVP-FIX-B #7: deliberately no client-side "future date" check here. The
  // server (jobs.lock procedure) is the source of truth; if the user submits
  // a current or past time, the server returns "Work date must be in the
  // future." and the existing `lock.error` block surfaces it. A duplicate
  // client check would silently no-op the submission (the original bug).
  const parsed = workDate ? new Date(workDate) : null;
  const parseable = parsed != null && !Number.isNaN(parsed.getTime());
  const canSubmit = parseable && enrolleeCount > 0 && !lock.isPending;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit || !parsed) return;
    lock.mutate({ jobId, workDate: parsed.toISOString() });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2" data-testid="lock-job-form">
      <label className="grid gap-1.5 text-sm font-medium">
        <span>Work date</span>
        <Input
          type="datetime-local"
          required
          value={workDate}
          onChange={(e) => setWorkDate(e.target.value)}
          data-testid="lock-job-work-date"
        />
      </label>
      {enrolleeCount === 0 ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          At least one Active must be enrolled before locking.
        </p>
      ) : null}
      {lock.error ? (
        <p
          role="alert"
          className="text-sm text-red-700 dark:text-red-300"
          data-testid="lock-job-error"
        >
          {lock.error.message}
        </p>
      ) : null}
      <Button type="submit" disabled={!canSubmit} data-testid="lock-job-submit">
        {lock.isPending ? 'Locking…' : 'Lock job'}
      </Button>
    </form>
  );
}
