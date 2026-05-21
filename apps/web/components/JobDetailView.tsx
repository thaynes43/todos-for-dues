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
import { UnenrollButton } from './UnenrollButton';
import { RescheduleButton } from './RescheduleButton';
import { CancelJobModal } from './CancelJobModal';
import { RevertCompletionButton } from './RevertCompletionButton';
import { DisputeJobModal } from './DisputeJobModal';
import { RejectedJobBanner } from './RejectedJobBanner';
import { CancelledJobBanner } from './CancelledJobBanner';
import { DisputedJobBanner } from './DisputedJobBanner';
import { ClosedJobBanner } from './ClosedJobBanner';
import {
  CompletedJobActiveView,
  type ViewerCredit,
} from './CompletedJobActiveView';
import { formatChapterLocal } from '@/lib/formatters';
import { sanitizeTel } from './PostJobForm';

export interface JobForDetailView {
  id: string;
  description: string;
  duesAmount: string;
  recommendedPeopleCount: number;
  state: JobState;
  postedBy: string;
  posterDisplayName?: string | null;
  posterContactKind?: 'email' | 'phone';
  posterContactValue?: string;
  location?: string;
  estimatedDurationHours?: string;
  additionalNotes?: string | null;
  workDate?: string | Date | null;
  rejectionReason?: string | null;
  cancellationReason?: string | null;
  disputeReason?: string | null;
  enrolleeCount: number;
  roster: ReadonlyArray<{
    activeId: string;
    enrolledAt: Date | string;
    confirmedAttendeeAt: Date | string | null;
  }> | null;
  closedBy?: { displayName: string | null } | null;
  viewerCredit?: ViewerCredit | null;
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

  const isTerminal =
    job.state === 'rejected' ||
    job.state === 'cancelled' ||
    job.state === 'closed' ||
    job.state === 'disputed';

  // PRD-010 R-03/R-05/R-06: enriched detail card. Render only the values the
  // poster explicitly entered; the poster's account email is never projected
  // here, so it cannot leak even if it differs from `posterContactValue`.
  const contactKind = job.posterContactKind ?? 'email';
  const contactValue = job.posterContactValue ?? '';
  const contactHref =
    contactKind === 'phone'
      ? `tel:${sanitizeTel(contactValue)}`
      : `mailto:${contactValue}`;
  const durationDisplay = job.estimatedDurationHours
    ? parseFloat(job.estimatedDurationHours).toString()
    : null;
  const trimmedNotes = (job.additionalNotes ?? '').trim();

  return (
    <article className="space-y-6" data-testid="job-detail-view">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold leading-tight">{job.description}</h1>
        <JobStateBadge state={job.state} />
      </header>

      <section
        className="space-y-1 rounded-md border p-4 text-sm"
        data-testid="job-details-card"
      >
        <p>
          <strong>Posted by:</strong>{' '}
          <span data-testid="job-poster-display-name">
            {job.posterDisplayName ?? 'Unknown'}
          </span>
        </p>
        <p>
          <strong>Contact ({contactKind}):</strong>{' '}
          <a
            href={contactHref}
            data-testid="job-contact-link"
            className="underline"
          >
            {contactValue}
          </a>
        </p>
        <p>
          <strong>Location:</strong>{' '}
          <span data-testid="job-location">{job.location ?? 'Unknown'}</span>
        </p>
        {durationDisplay ? (
          <p>
            <strong>Estimated duration:</strong>{' '}
            <span data-testid="job-duration">{durationDisplay}</span> hours
          </p>
        ) : null}
      </section>

      {trimmedNotes.length > 0 ? (
        <section
          className="space-y-1 rounded-md border p-4 text-sm"
          data-testid="job-notes-card"
        >
          <p className="font-semibold">Additional notes</p>
          <p data-testid="job-notes-body" className="whitespace-pre-wrap">
            {trimmedNotes}
          </p>
        </section>
      ) : null}

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

      {/* Terminal-state banners — suppress all action affordances when present. */}
      {job.state === 'rejected' && (
        <RejectedJobBanner
          reason={job.rejectionReason}
          canPostNew={isPoster || isMod}
        />
      )}
      {job.state === 'cancelled' && (
        <CancelledJobBanner reason={job.cancellationReason} />
      )}
      {job.state === 'disputed' && (
        <DisputedJobBanner reason={isAdmin ? job.disputeReason : undefined} />
      )}
      {job.state === 'closed' && (
        <ClosedJobBanner
          closedByDisplayName={job.closedBy?.displayName ?? null}
        />
      )}

      {/* Active-side completed-view (credit display). Renders for completed /
         payment_sent / closed when the viewer is an enrolled Active. */}
      {viewer.role === 'Active' &&
        viewerEnrolled &&
        (job.state === 'completed' ||
          job.state === 'payment_sent' ||
          job.state === 'closed') && (
          <CompletedJobActiveView viewerCredit={job.viewerCredit ?? null} />
        )}

      {/* Action affordances. Suppressed entirely for terminal states. */}
      {!isTerminal && (
        <section className="space-y-3" data-testid="job-actions">
          {viewer.role === 'Active' &&
            job.state === 'enrollment_open' &&
            !viewerEnrolled && (
              <EnrollButton jobId={job.id} state={job.state} />
            )}

          {viewer.role === 'Active' &&
            job.state === 'enrollment_open' &&
            viewerEnrolled && (
              <UnenrollButton jobId={job.id} state={job.state} />
            )}

          {isPoster && job.state === 'enrollment_open' && (
            <>
              <LockJobForm jobId={job.id} enrolleeCount={job.enrolleeCount} />
              <CancelJobModal jobId={job.id} />
            </>
          )}

          {isPoster && job.state === 'locked' && (
            <>
              <CompleteJobForm jobId={job.id} roster={rosterEntries} />
              <RescheduleButton jobId={job.id} />
              <CancelJobModal jobId={job.id} />
            </>
          )}

          {isPoster && job.state === 'completed' && (
            <>
              <MarkPaymentSentButton
                jobId={job.id}
                treasurerRecipient={treasurerRecipient}
              />
              <RevertCompletionButton jobId={job.id} />
            </>
          )}

          {/* MVP-FIX-B #6: Hide the recipient-side affordances from the
              poster — they're waiting on the Active to confirm/dispute, not
              acting themselves. An Admin who is NOT the poster still sees
              them per PRD-006 R-02 (Admin-on-behalf confirm). An enrolled
              Active sees them per PRD-006 R-01. The previous (viewerEnrolled
              || isAdmin) check let the Admin-as-poster see both buttons,
              which was the reported bug. */}
          {!isPoster &&
            (viewerEnrolled || isAdmin) &&
            job.state === 'payment_sent' && (
              <>
                <ConfirmReceivedButton jobId={job.id} />
                <DisputeJobModal jobId={job.id} />
              </>
            )}

          {isMod && job.state === 'awaiting_moderation' && (
            <ApproveRejectButtons jobId={job.id} />
          )}
        </section>
      )}

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
