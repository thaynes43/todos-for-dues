'use client';

import { trpc } from '@/lib/trpc-client';
import type { JobState, Role } from '@app/db/schema';
import { JobStateBadge } from './JobStateBadge';
import { EnrollButton } from './EnrollButton';
import { LockJobForm } from './LockJobForm';
import { CompleteJobForm, type RosterEntry } from './CompleteJobForm';
import { MarkPaymentSentButton } from './MarkPaymentSentButton';
import { ConfirmReceivedButton } from './ConfirmReceivedButton';
import { TippingNudge } from './TippingNudge';
import { ApproveRejectButtons } from './ApproveRejectButtons';
import { formatChapterLocal } from '@/lib/formatters';

export interface JobForDetailView {
  id: string;
  description: string;
  duesAmount: string;
  recommendedPeopleCount: number;
  state: JobState;
  postedBy: string;
  workDate?: string | Date | null;
  enrolleeCount: number;
  roster: ReadonlyArray<{
    activeId: string;
    enrolledAt: Date | string;
    confirmedAttendeeAt: Date | string | null;
  }> | null;
}

export interface Viewer {
  id: string;
  role: Role;
}

interface RosterDisplayName {
  activeId: string;
  displayName: string;
}

export function JobDetailView({
  job,
  viewer,
  rosterNames,
  treasurerRecipient,
}: {
  job: JobForDetailView;
  viewer: Viewer;
  rosterNames?: ReadonlyArray<RosterDisplayName>;
  treasurerRecipient?: string | null;
}) {
  const isPoster = job.postedBy === viewer.id;
  const isAdmin = viewer.role === 'Admin';
  const isMod = viewer.role === 'Moderator' || isAdmin;
  const seesRoster = job.roster != null;
  const viewerEnrolled =
    seesRoster && job.roster!.some((r) => r.activeId === viewer.id);

  const rosterEntries: RosterEntry[] = (job.roster ?? []).map((r) => ({
    activeId: r.activeId,
    displayName: rosterNames?.find((n) => n.activeId === r.activeId)?.displayName,
  }));

  return (
    <article className="space-y-6" data-testid="job-detail-view">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold leading-tight">{job.description}</h1>
        <JobStateBadge state={job.state} />
      </header>

      <section className="space-y-1 text-sm">
        <p>
          <strong>Dues:</strong> ${job.duesAmount}
        </p>
        <p>
          <strong>Recommended:</strong> {job.recommendedPeopleCount} people
        </p>
        {job.workDate ? (
          <p>
            <strong>Work date:</strong>{' '}
            <time
              dateTime={
                typeof job.workDate === 'string'
                  ? job.workDate
                  : job.workDate.toISOString()
              }
            >
              {formatChapterLocal(job.workDate)}
            </time>
          </p>
        ) : null}
        {seesRoster ? (
          rosterEntries.length === 0 ? (
            <p>
              <strong>Enrolled:</strong> nobody yet
            </p>
          ) : (
            <p>
              <strong>Enrolled:</strong>{' '}
              {rosterEntries
                .map((r) => r.displayName ?? r.activeId)
                .join(', ')}
            </p>
          )
        ) : (
          <p>
            <strong>Enrolled:</strong> {job.enrolleeCount} people
          </p>
        )}
      </section>

      <section className="space-y-3">
        {viewer.role === 'Active' &&
          job.state === 'enrollment_open' &&
          !viewerEnrolled && <EnrollButton jobId={job.id} state={job.state} />}

        {isPoster && job.state === 'enrollment_open' && (
          <LockJobForm jobId={job.id} enrolleeCount={job.enrolleeCount} />
        )}

        {isPoster && job.state === 'locked' && (
          <CompleteJobForm jobId={job.id} roster={rosterEntries} />
        )}

        {isPoster && job.state === 'completed' && (
          <MarkPaymentSentButton
            jobId={job.id}
            treasurerRecipient={treasurerRecipient}
          />
        )}

        {(viewerEnrolled || isAdmin) && job.state === 'payment_sent' && (
          <ConfirmReceivedButton jobId={job.id} />
        )}

        {isMod && job.state === 'awaiting_moderation' && (
          <ApproveRejectButtons jobId={job.id} />
        )}
      </section>

      {(job.state === 'payment_sent' || job.state === 'closed') && (
        <TippingNudge />
      )}
    </article>
  );
}

export function JobDetailLoader({
  jobId,
  viewer,
  rosterNames,
  treasurerRecipient,
}: {
  jobId: string;
  viewer: Viewer;
  rosterNames?: ReadonlyArray<RosterDisplayName>;
  treasurerRecipient?: string | null;
}) {
  const query = trpc.jobs.getById.useQuery({ jobId });
  if (query.isLoading) return <p data-testid="job-detail-loading">Loading…</p>;
  if (query.error) {
    return (
      <div
        role="alert"
        className="rounded border border-red-500 bg-red-50 p-3 text-sm text-red-900"
      >
        {query.error.message}
      </div>
    );
  }
  if (!query.data) return <p>Not found.</p>;
  return (
    <JobDetailView
      job={query.data as unknown as JobForDetailView}
      viewer={viewer}
      rosterNames={rosterNames}
      treasurerRecipient={treasurerRecipient}
    />
  );
}
