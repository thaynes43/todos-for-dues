import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Role } from '@app/db/schema';

vi.mock('@/lib/trpc-client', () => {
  const stubMutation = () => ({
    useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  });
  return {
    trpc: {
      useUtils: () => ({
        jobs: {
          getById: { invalidate: vi.fn() },
          listModerationQueue: { invalidate: vi.fn() },
          listByState: { invalidate: vi.fn() },
          listMyEnrolled: { invalidate: vi.fn() },
        },
      }),
      jobs: {
        enroll: stubMutation(),
        unenroll: stubMutation(),
        lock: stubMutation(),
        complete: stubMutation(),
        markPaymentSent: stubMutation(),
        confirmReceipt: stubMutation(),
        approve: stubMutation(),
        reject: stubMutation(),
        reschedule: stubMutation(),
        cancel: stubMutation(),
        revertCompletion: stubMutation(),
        dispute: stubMutation(),
      },
    },
  };
});

import {
  JobDetailView,
  type JobForDetailView,
} from '@/components/JobDetailView';

function baseJob(overrides: Partial<JobForDetailView> = {}): JobForDetailView {
  return {
    id: 'job-1',
    description: 'Rake the leaves',
    duesAmount: '40.00',
    recommendedPeopleCount: 2,
    state: 'enrollment_open',
    postedBy: 'alumni-1',
    workDate: null,
    enrolleeCount: 1,
    roster: [
      {
        activeId: 'active-1',
        enrolledAt: new Date().toISOString(),
        confirmedAttendeeAt: null,
      },
    ],
    ...overrides,
  };
}

function viewer(role: Role, id = 'viewer-1') {
  return { id, role };
}

describe('<JobDetailView> walking-skeleton affordances', () => {
  it('Active not-enrolled on enrollment_open sees EnrollButton', () => {
    const job = baseJob({
      state: 'enrollment_open',
      roster: [],
      enrolleeCount: 0,
    });
    render(<JobDetailView job={job} viewer={viewer('Active', 'newcomer')} />);
    expect(screen.getByTestId('enroll-button')).toBeInTheDocument();
  });

  it('Active enrolled on enrollment_open does NOT see EnrollButton', () => {
    const job = baseJob({ state: 'enrollment_open' });
    render(<JobDetailView job={job} viewer={viewer('Active', 'active-1')} />);
    expect(screen.queryByTestId('enroll-button')).not.toBeInTheDocument();
  });

  it('Alumni-poster on enrollment_open sees LockJobForm', () => {
    const job = baseJob({ state: 'enrollment_open' });
    render(<JobDetailView job={job} viewer={viewer('Alumni', 'alumni-1')} />);
    expect(screen.getByTestId('lock-job-form')).toBeInTheDocument();
  });

  it('Alumni-poster on locked sees CompleteJobForm', () => {
    const job = baseJob({ state: 'locked' });
    render(<JobDetailView job={job} viewer={viewer('Alumni', 'alumni-1')} />);
    expect(screen.getByTestId('complete-job-form')).toBeInTheDocument();
  });

  it('Alumni-poster on completed sees MarkPaymentSentButton', () => {
    const job = baseJob({ state: 'completed' });
    render(<JobDetailView job={job} viewer={viewer('Alumni', 'alumni-1')} />);
    expect(screen.getByTestId('mark-payment-sent-button')).toBeInTheDocument();
  });

  it('Enrolled Active on payment_sent sees ConfirmReceivedButton', () => {
    const job = baseJob({ state: 'payment_sent' });
    render(<JobDetailView job={job} viewer={viewer('Active', 'active-1')} />);
    expect(screen.getByTestId('confirm-received-button')).toBeInTheDocument();
  });

  it('Moderator on awaiting_moderation sees Approve button', () => {
    const job = baseJob({ state: 'awaiting_moderation', roster: null });
    render(<JobDetailView job={job} viewer={viewer('Moderator', 'mod-1')} />);
    expect(screen.getByTestId('approve-button')).toBeInTheDocument();
  });

  it('renders TippingNudge in payment_sent and closed', () => {
    const ps = baseJob({ state: 'payment_sent' });
    const { unmount } = render(
      <JobDetailView job={ps} viewer={viewer('Active', 'active-1')} />,
    );
    expect(screen.getByTestId('tipping-nudge')).toBeInTheDocument();
    unmount();
    const closed = baseJob({ state: 'closed' });
    render(<JobDetailView job={closed} viewer={viewer('Active', 'active-1')} />);
    expect(screen.getByTestId('tipping-nudge')).toBeInTheDocument();
  });

  it('does NOT render TippingNudge in locked', () => {
    const job = baseJob({ state: 'locked' });
    render(<JobDetailView job={job} viewer={viewer('Active', 'active-1')} />);
    expect(screen.queryByTestId('tipping-nudge')).not.toBeInTheDocument();
  });

  it('shows roster names when caller is enrolled (roster present); non-enrolled Active shows only count', () => {
    const job = baseJob({
      state: 'enrollment_open',
      roster: [
        {
          activeId: 'active-1',
          enrolledAt: new Date().toISOString(),
          confirmedAttendeeAt: null,
        },
      ],
      enrolleeCount: 1,
    });
    render(
      <JobDetailView
        job={job}
        viewer={viewer('Active', 'active-1')}
        rosterNames={[{ activeId: 'active-1', displayName: 'Alice Active' }]}
      />,
    );
    expect(screen.getByText(/Alice Active/)).toBeInTheDocument();
  });

  it('hides the roster (only count) when getById projects roster=null', () => {
    const job = baseJob({
      state: 'enrollment_open',
      roster: null,
      enrolleeCount: 3,
    });
    render(<JobDetailView job={job} viewer={viewer('Active', 'outside')} />);
    expect(screen.getByText(/3 people/)).toBeInTheDocument();
  });
});

describe('<JobDetailView> PLAN-010 MVP additions', () => {
  it('Active enrolled on enrollment_open sees UnenrollButton (PRD-004 R-03)', () => {
    const job = baseJob({ state: 'enrollment_open' });
    render(<JobDetailView job={job} viewer={viewer('Active', 'active-1')} />);
    expect(screen.getByTestId('unenroll-button')).toBeInTheDocument();
  });

  it('Active enrolled on locked does NOT see UnenrollButton (PRD-004 AC-05)', () => {
    const job = baseJob({ state: 'locked' });
    render(<JobDetailView job={job} viewer={viewer('Active', 'active-1')} />);
    expect(screen.queryByTestId('unenroll-button')).not.toBeInTheDocument();
  });

  it('Alumni-poster on enrollment_open sees LockJobForm + CancelJobModal', () => {
    const job = baseJob({ state: 'enrollment_open' });
    render(<JobDetailView job={job} viewer={viewer('Alumni', 'alumni-1')} />);
    expect(screen.getByTestId('lock-job-form')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-job-button')).toBeInTheDocument();
  });

  it('Alumni-poster on locked sees CompleteJobForm + Reschedule + Cancel', () => {
    const job = baseJob({ state: 'locked' });
    render(<JobDetailView job={job} viewer={viewer('Alumni', 'alumni-1')} />);
    expect(screen.getByTestId('complete-job-form')).toBeInTheDocument();
    expect(screen.getByTestId('reschedule-button')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-job-button')).toBeInTheDocument();
  });

  it('Alumni-poster on completed sees MarkPaymentSent + RevertCompletion', () => {
    const job = baseJob({ state: 'completed' });
    render(<JobDetailView job={job} viewer={viewer('Alumni', 'alumni-1')} />);
    expect(screen.getByTestId('mark-payment-sent-button')).toBeInTheDocument();
    expect(screen.getByTestId('revert-completion-button')).toBeInTheDocument();
  });

  it('Active enrolled on payment_sent sees Confirm + Dispute', () => {
    const job = baseJob({ state: 'payment_sent' });
    render(<JobDetailView job={job} viewer={viewer('Active', 'active-1')} />);
    expect(screen.getByTestId('confirm-received-button')).toBeInTheDocument();
    expect(screen.getByTestId('dispute-button')).toBeInTheDocument();
  });

  it('rejected state renders only RejectedJobBanner, no other actions', () => {
    const job = baseJob({
      state: 'rejected',
      rejectionReason: 'dues too low',
      roster: null,
    });
    render(<JobDetailView job={job} viewer={viewer('Alumni', 'alumni-1')} />);
    expect(screen.getByTestId('rejected-job-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('job-actions')).not.toBeInTheDocument();
  });

  it('rejected state for the poster shows the Post-new-job CTA', () => {
    const job = baseJob({
      state: 'rejected',
      rejectionReason: 'dues too low',
      roster: null,
    });
    render(<JobDetailView job={job} viewer={viewer('Alumni', 'alumni-1')} />);
    expect(screen.getByTestId('rejected-post-new-cta')).toBeInTheDocument();
  });

  it('cancelled state renders only CancelledJobBanner', () => {
    const job = baseJob({
      state: 'cancelled',
      cancellationReason: 'Mom moved the couch',
    });
    render(<JobDetailView job={job} viewer={viewer('Active', 'active-1')} />);
    expect(screen.getByTestId('cancelled-job-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('job-actions')).not.toBeInTheDocument();
  });

  it('disputed state for an Active renders DisputedJobBanner', () => {
    const job = baseJob({ state: 'disputed' });
    render(<JobDetailView job={job} viewer={viewer('Active', 'active-1')} />);
    expect(screen.getByTestId('disputed-job-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('job-actions')).not.toBeInTheDocument();
  });

  it('closed state renders ClosedJobBanner with the closer name', () => {
    const job = baseJob({
      state: 'closed',
      closedBy: { displayName: 'Alice Active' },
    });
    render(<JobDetailView job={job} viewer={viewer('Active', 'active-1')} />);
    expect(screen.getByTestId('closed-job-banner')).toBeInTheDocument();
    expect(screen.getByTestId('closed-by-name')).toHaveTextContent(
      /Alice Active/,
    );
  });

  it('Active enrolled + completed shows credit (Q-PLN-01 confirmed)', () => {
    const job = baseJob({
      state: 'completed',
      viewerCredit: { confirmed: true, amount: '25.00' },
    });
    render(<JobDetailView job={job} viewer={viewer('Active', 'active-1')} />);
    expect(screen.getByTestId('completed-credit-amount')).toHaveTextContent(
      /\$25\.00/,
    );
  });

  it('Active enrolled + payment_sent who was not confirmed sees "weren\'t confirmed" copy', () => {
    const job = baseJob({
      state: 'payment_sent',
      viewerCredit: { confirmed: false, amount: null },
    });
    render(<JobDetailView job={job} viewer={viewer('Active', 'active-1')} />);
    expect(screen.getByTestId('completed-not-confirmed')).toBeInTheDocument();
  });
});

describe('<JobDetailView> payment_sent RBAC (MVP-FIX-B #6)', () => {
  it('Alumni poster on payment_sent does NOT see Confirm Received or Dispute', () => {
    const job = baseJob({ state: 'payment_sent' });
    render(<JobDetailView job={job} viewer={viewer('Alumni', 'alumni-1')} />);
    expect(
      screen.queryByTestId('confirm-received-button'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('dispute-button')).not.toBeInTheDocument();
  });

  it('Admin who IS the poster on payment_sent does NOT see Confirm or Dispute', () => {
    // The Admin-as-poster shouldn't act as recipient on their own job. The
    // previous (viewerEnrolled || isAdmin) check incorrectly let them.
    const job = baseJob({ state: 'payment_sent', postedBy: 'admin-1' });
    render(<JobDetailView job={job} viewer={viewer('Admin', 'admin-1')} />);
    expect(
      screen.queryByTestId('confirm-received-button'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('dispute-button')).not.toBeInTheDocument();
  });

  it('Admin (not poster, not enrolled) on payment_sent DOES see Confirm + Dispute (PRD-006 R-02)', () => {
    // PRD-006 R-02: any Admin may confirm receipt on chapter authority.
    const job = baseJob({ state: 'payment_sent', postedBy: 'alumni-1' });
    render(<JobDetailView job={job} viewer={viewer('Admin', 'admin-2')} />);
    expect(screen.getByTestId('confirm-received-button')).toBeInTheDocument();
    expect(screen.getByTestId('dispute-button')).toBeInTheDocument();
  });

  it('Moderator (not poster, not enrolled) on payment_sent does NOT see Confirm or Dispute', () => {
    // Moderator is not Admin and is not enrolled — no recipient-side access.
    const job = baseJob({ state: 'payment_sent' });
    render(<JobDetailView job={job} viewer={viewer('Moderator', 'mod-1')} />);
    expect(
      screen.queryByTestId('confirm-received-button'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('dispute-button')).not.toBeInTheDocument();
  });

  it('Non-enrolled non-Admin Active on payment_sent does NOT see Confirm or Dispute (PRD-006 R-03)', () => {
    const job = baseJob({ state: 'payment_sent' });
    render(
      <JobDetailView job={job} viewer={viewer('Active', 'outsider-active')} />,
    );
    expect(
      screen.queryByTestId('confirm-received-button'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('dispute-button')).not.toBeInTheDocument();
  });

  it('Enrolled Active on payment_sent DOES see Confirm + Dispute (PRD-006 R-01)', () => {
    const job = baseJob({ state: 'payment_sent' });
    render(<JobDetailView job={job} viewer={viewer('Active', 'active-1')} />);
    expect(screen.getByTestId('confirm-received-button')).toBeInTheDocument();
    expect(screen.getByTestId('dispute-button')).toBeInTheDocument();
  });
});
