import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Role } from '@app/db/schema';

vi.mock('@/lib/trpc-client', () => ({
  trpc: {
    useUtils: () => ({ jobs: { getById: { invalidate: vi.fn() } } }),
    jobs: {
      enroll: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
      lock: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
      complete: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
      markPaymentSent: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
      },
      confirmReceipt: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
      },
      approve: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
      },
    },
  },
}));

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
