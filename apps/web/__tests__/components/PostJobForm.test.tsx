import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const mutate = vi.fn();
const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/trpc-client', () => ({
  trpc: {
    jobs: {
      post: {
        useMutation: (opts?: { onSuccess?: (data: { jobId: string }) => void }) => ({
          mutate: (input: unknown) => {
            mutate(input);
            opts?.onSuccess?.({ jobId: 'fake-job-id' });
          },
          isPending: false,
          error: null,
        }),
      },
    },
  },
}));

import { PostJobForm } from '@/components/PostJobForm';

beforeEach(() => {
  mutate.mockClear();
  push.mockClear();
});

const DEFAULT_EMAIL = 'alumni@chapter.test';

describe('<PostJobForm>', () => {
  it('submits parsed inputs (including PRD-010 enriched fields) to trpc.jobs.post', () => {
    render(<PostJobForm defaultContactEmail={DEFAULT_EMAIL} />);
    act(() => {
      fireEvent.change(screen.getByPlaceholderText(/Describe the job/i), {
        target: { value: 'Rake the leaves' },
      });
      fireEvent.change(document.querySelector('input[name="duesAmount"]')!, {
        target: { value: '40' },
      });
      fireEvent.change(
        document.querySelector('input[name="recommendedPeopleCount"]')!,
        { target: { value: '2' } },
      );
      fireEvent.change(screen.getByTestId('post-job-location'), {
        target: { value: 'Chapter house' },
      });
      fireEvent.change(screen.getByTestId('post-job-duration'), {
        target: { value: '1.5' },
      });
    });
    fireEvent.submit(
      screen.getByRole('button', { name: /Post job/i }).closest('form')!,
    );

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({
      description: 'Rake the leaves',
      duesAmount: 40,
      recommendedPeopleCount: 2,
      posterContactKind: 'email',
      posterContactValue: DEFAULT_EMAIL,
      location: 'Chapter house',
      estimatedDurationHours: 1.5,
      additionalNotes: null,
    });
    expect(push).toHaveBeenCalledWith('/jobs/fake-job-id');
  });

  it('disables submit until inputs are valid', () => {
    render(<PostJobForm defaultContactEmail={DEFAULT_EMAIL} />);
    const submit = screen.getByRole('button', { name: /Post job/i });
    expect(submit).toBeDisabled();
  });

  it('pre-fills the contact-value field with defaultContactEmail', () => {
    render(<PostJobForm defaultContactEmail={DEFAULT_EMAIL} />);
    const cv = screen.getByTestId('post-job-contact-value') as HTMLInputElement;
    expect(cv.value).toBe(DEFAULT_EMAIL);
  });

  it('surfaces inline error when contact-value is cleared', () => {
    render(<PostJobForm defaultContactEmail={DEFAULT_EMAIL} />);
    act(() => {
      fireEvent.change(screen.getByTestId('post-job-contact-value'), {
        target: { value: '' },
      });
    });
    expect(
      screen.getByTestId('post-job-contact-value-error'),
    ).toBeInTheDocument();
  });

  it('surfaces inline error when duration is out of range', () => {
    render(<PostJobForm defaultContactEmail={DEFAULT_EMAIL} />);
    act(() => {
      fireEvent.change(screen.getByTestId('post-job-duration'), {
        target: { value: '25' },
      });
    });
    expect(
      screen.getByTestId('post-job-duration-error'),
    ).toBeInTheDocument();
  });
});
