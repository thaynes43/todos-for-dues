'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function toLocalDatetimeMin(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

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
  const min = useMemo(() => toLocalDatetimeMin(), []);

  const lock = trpc.jobs.lock.useMutation({
    onSuccess: async () => {
      await utils.jobs.getById.invalidate({ jobId });
      router.refresh();
    },
  });

  const parsed = workDate ? new Date(workDate) : null;
  const isFuture = parsed != null && !Number.isNaN(parsed.getTime()) && parsed > new Date();
  const canSubmit = isFuture && enrolleeCount > 0 && !lock.isPending;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit || !parsed) return;
    lock.mutate({ jobId, workDate: parsed.toISOString() });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2" data-testid="lock-job-form">
      <label className="block space-y-1">
        <span className="block text-sm font-medium">Work date</span>
        <Input
          type="datetime-local"
          required
          min={min}
          value={workDate}
          onChange={(e) => setWorkDate(e.target.value)}
          data-testid="lock-job-work-date"
        />
      </label>
      {enrolleeCount === 0 ? (
        <p className="text-sm text-amber-700">
          At least one Active must be enrolled before locking.
        </p>
      ) : null}
      {lock.error ? (
        <p role="alert" className="text-sm text-red-700">
          {lock.error.message}
        </p>
      ) : null}
      <Button type="submit" disabled={!canSubmit} data-testid="lock-job-submit">
        {lock.isPending ? 'Locking…' : 'Lock job'}
      </Button>
    </form>
  );
}
