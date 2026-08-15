'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { StatusNote } from '@/components/StatusNote';

/**
 * Member-status control (ADR-015). The portal registry is the ONLY source of
 * truth and store: on load we read fresh status via `memberStatus.get`; picking
 * a side PUTs it via `memberStatus.set` (which re-reads). Status is FULLY
 * ORTHOGONAL to role — this control never reads or writes any role field, and
 * it renders identically for a Member, Moderator, or Admin.
 *
 * Portal states:
 * - `ok` / `undeclared` → the active/alumni toggle (undeclared = neither side
 *   selected yet);
 * - `no-registry-row` → the member has no linked roster row (409) → hide the
 *   control entirely (nothing to declare against);
 * - `unavailable` → portal down / not yet shipped → a one-sentence note, no
 *   control. There is NO local fallback anymore.
 */

type MemberStatus = 'active' | 'alumni';

const CHOICES: ReadonlyArray<{ status: MemberStatus; label: string }> = [
  { status: 'active', label: 'Active' },
  { status: 'alumni', label: 'Alumni' },
];

export function ProfileStatusSection() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [saved, setSaved] = useState(false);

  const state = trpc.memberStatus.get.useQuery(undefined, {
    refetchOnWindowFocus: false,
    retry: false,
  });

  const setStatus = trpc.memberStatus.set.useMutation({
    onSuccess: (fresh) => {
      utils.memberStatus.get.setData(undefined, fresh);
      setSaved(fresh.kind === 'ok');
      // Re-render server components so the status-based access gates (nav +
      // page redirects) follow the new declaration on this same session.
      router.refresh();
    },
  });

  if (state.error) {
    // Our own API erroring is not a portal signal — show a terse note, never a
    // role control (there is none anymore).
    return (
      <div data-testid="member-status-section" data-portal="error">
        <StatusNote tone="error">
          Couldn&apos;t load your status — try a refresh.
        </StatusNote>
      </div>
    );
  }

  if (state.isPending) {
    return (
      <div
        data-testid="member-status-section"
        data-portal="loading"
        aria-busy="true"
        className="flex flex-wrap items-center gap-2"
      >
        {CHOICES.map((c) => (
          <Button key={c.status} type="button" variant="neutral" size="sm" disabled>
            {c.label}
          </Button>
        ))}
      </div>
    );
  }

  const data = state.data;
  if (!data) return null; // unreachable: !error && !isPending ⇒ data

  if (data.kind === 'no-registry-row') {
    // Nothing to declare against — hide the control entirely.
    return (
      <div data-testid="member-status-section" data-portal="no-registry-row" />
    );
  }

  if (data.kind === 'unavailable') {
    // Portal down / not yet shipped — no control, one-sentence note.
    return (
      <div data-testid="member-status-section" data-portal="off">
        <StatusNote tone="warning">
          Status is set at your Sigo Alumni account and isn&apos;t reachable
          right now — check back soon.
        </StatusNote>
      </div>
    );
  }

  // ok | undeclared → show the toggle (undeclared = neither side current yet).
  const current: MemberStatus | null = data.kind === 'ok' ? data.status : null;

  const handleSelect = (choice: MemberStatus, isCurrent: boolean) => {
    if (isCurrent || setStatus.isPending) return;
    setSaved(false);
    setStatus.mutate({ status: choice });
  };

  return (
    <div
      className="space-y-2"
      data-testid="member-status-section"
      data-portal="on"
      data-current-status={current ?? 'none'}
    >
      {current === null ? (
        <p className="text-sm opacity-70" data-testid="member-status-undeclared">
          You haven&apos;t picked a side yet.
        </p>
      ) : null}
      <div
        role="group"
        aria-label="Active or Alumni?"
        className="flex flex-wrap items-center gap-2"
      >
        {CHOICES.map((c) => {
          const isCurrent = c.status === current;
          return (
            <Button
              key={c.status}
              type="button"
              variant={isCurrent ? 'secondary' : 'neutral'}
              size="sm"
              disabled={isCurrent || setStatus.isPending}
              onClick={() => handleSelect(c.status, isCurrent)}
              data-testid={`member-status-option-${c.status}`}
              data-is-current={isCurrent ? 'true' : 'false'}
            >
              {isCurrent ? `${c.label} (current)` : c.label}
            </Button>
          );
        })}
      </div>
      {saved ? (
        <p
          role="status"
          data-testid="member-status-saved"
          className="text-sm text-accent-strong"
        >
          Saved
        </p>
      ) : null}
      {setStatus.error ? (
        <p
          role="alert"
          data-testid="member-status-error"
          className="text-sm text-red-700 dark:text-red-300"
        >
          That didn&apos;t save — try again.
        </p>
      ) : null}
    </div>
  );
}
