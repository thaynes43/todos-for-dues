'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';

type MemberStatus = 'active' | 'alumni';

const STATUS_OPTIONS: ReadonlyArray<{ value: MemberStatus; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'alumni', label: 'Alumni' },
];

/**
 * Self-set member status (sigo-alumni item 07). The portal registry is the
 * only store: current truth is fetched on every page load, and a change is
 * written through, then re-read. The whole section renders nothing until the
 * fetch confirms the feature is live for this user — today (portal API not
 * built) it is always hidden. `initialStatus` is the sign-in claim snapshot,
 * used only to preselect while the first fetch is in flight.
 */
export function ProfileStatusSection({ initialStatus }: { initialStatus: MemberStatus | null }) {
  const [saved, setSaved] = useState(false);
  const utils = trpc.useUtils();

  const statusQuery = trpc.memberStatus.get.useQuery(undefined, {
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const setStatus = trpc.memberStatus.set.useMutation({
    onSuccess: (view) => {
      utils.memberStatus.get.setData(undefined, view);
      setSaved(true);
    },
    onError: () => {
      setSaved(false);
      // A NOT_FOUND / SERVICE_UNAVAILABLE here means the feature went away
      // for this user — refetch so the section hides itself.
      void utils.memberStatus.get.invalidate();
    },
  });

  const view = statusQuery.data;

  // Hidden until the read confirms availability. While the first fetch is in
  // flight, the claim snapshot (when present) keeps the control from popping
  // in late for users who already have a status.
  if (view ? !view.available : initialStatus === null) return null;

  const current = view?.available ? view.status : initialStatus;
  const busy = setStatus.isPending || statusQuery.isFetching;

  const inlineError =
    setStatus.error && setStatus.error.data?.code !== 'NOT_FOUND' ? 'Try again.' : null;

  return (
    <section className="space-y-3" data-testid="profile-status-section">
      <h2 className="text-2xl font-semibold sm:text-3xl">Status</h2>
      <p className="max-w-2xl text-sm opacity-70">Are you an active brother or an alumnus?</p>
      <div role="group" aria-label="Status" className="flex flex-wrap items-center gap-2">
        {STATUS_OPTIONS.map((opt) => {
          const isCurrent = opt.value === current;
          return (
            <Button
              key={opt.value}
              type="button"
              variant={isCurrent ? 'secondary' : 'neutral'}
              size="sm"
              aria-pressed={isCurrent}
              disabled={isCurrent || busy || !view}
              onClick={() => {
                setSaved(false);
                setStatus.mutate({ status: opt.value });
              }}
              data-testid={`member-status-option-${opt.value}`}
              data-is-current={isCurrent ? 'true' : 'false'}
            >
              {opt.label}
            </Button>
          );
        })}
      </div>
      {saved ? (
        <p role="status" data-testid="member-status-saved" className="text-sm opacity-70">
          Saved.
        </p>
      ) : null}
      {inlineError ? (
        <p
          role="alert"
          data-testid="member-status-error"
          className="text-sm text-red-700 dark:text-red-300"
        >
          {inlineError}
        </p>
      ) : null}
    </section>
  );
}
