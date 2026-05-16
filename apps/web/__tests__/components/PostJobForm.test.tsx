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

describe('<PostJobForm>', () => {
  it('submits parsed inputs to trpc.jobs.post', () => {
    render(<PostJobForm />);
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
    });
    fireEvent.submit(
      screen.getByRole('button', { name: /Post job/i }).closest('form')!,
    );

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({
      description: 'Rake the leaves',
      duesAmount: 40,
      recommendedPeopleCount: 2,
    });
    expect(push).toHaveBeenCalledWith('/jobs/fake-job-id');
  });

  it('disables submit until inputs are valid', () => {
    render(<PostJobForm />);
    const submit = screen.getByRole('button', { name: /Post job/i });
    expect(submit).toBeDisabled();
  });
});
