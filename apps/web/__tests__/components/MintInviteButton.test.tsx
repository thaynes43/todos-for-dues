import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  mintMutate: vi.fn(),
  invalidate: vi.fn(),
  mintOpts: {
    onSuccess: undefined as
      | ((data: unknown, variables: unknown) => void | Promise<void>)
      | undefined,
  },
}));

vi.mock('@/lib/trpc-client', () => ({
  trpc: {
    useUtils: () => ({
      invites: { list: { invalidate: mocks.invalidate } },
    }),
    invites: {
      mint: {
        useMutation: (opts: {
          onSuccess?: (data: unknown, variables: unknown) => void | Promise<void>;
        }) => {
          mocks.mintOpts.onSuccess = opts.onSuccess;
          return {
            mutate: (input: { preselectedRole: 'Active' | 'Alumni' }) =>
              mocks.mintMutate(input),
            isPending: false,
            error: null,
          };
        },
      },
    },
  },
}));

import { MintInviteButton } from '@/components/MintInviteButton';

beforeEach(() => {
  mocks.mintMutate.mockClear();
  mocks.invalidate.mockClear();
  mocks.mintOpts.onSuccess = undefined;
});

describe('<MintInviteButton>', () => {
  it('renders the trigger button; modal is closed initially', () => {
    render(<MintInviteButton />);
    expect(screen.getByTestId('mint-invite-button')).toBeInTheDocument();
    expect(screen.queryByTestId('mint-invite-modal')).not.toBeInTheDocument();
  });

  it('opens the modal on click', () => {
    render(<MintInviteButton />);
    fireEvent.click(screen.getByTestId('mint-invite-button'));
    expect(screen.getByTestId('mint-invite-modal')).toBeInTheDocument();
  });

  it('the role selector renders Active + Alumni only — never Moderator or Admin', () => {
    render(<MintInviteButton />);
    fireEvent.click(screen.getByTestId('mint-invite-button'));
    expect(screen.getByTestId('mint-invite-role-Active')).toBeInTheDocument();
    expect(screen.getByTestId('mint-invite-role-Alumni')).toBeInTheDocument();
    expect(screen.queryByTestId('mint-invite-role-Moderator')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mint-invite-role-Admin')).not.toBeInTheDocument();
  });

  it('submitting fires mint.mutate with the selected role (Active default)', () => {
    render(<MintInviteButton />);
    fireEvent.click(screen.getByTestId('mint-invite-button'));
    fireEvent.click(screen.getByTestId('mint-invite-submit'));
    expect(mocks.mintMutate).toHaveBeenCalledTimes(1);
    expect(mocks.mintMutate).toHaveBeenCalledWith({ preselectedRole: 'Active' });
  });

  it('switching to Alumni then submitting passes preselectedRole: Alumni', () => {
    render(<MintInviteButton />);
    fireEvent.click(screen.getByTestId('mint-invite-button'));
    const alumniRadio = screen
      .getByTestId('mint-invite-role-Alumni')
      .querySelector('input[type="radio"]') as HTMLInputElement;
    fireEvent.click(alumniRadio);
    fireEvent.click(screen.getByTestId('mint-invite-submit'));
    expect(mocks.mintMutate).toHaveBeenCalledWith({ preselectedRole: 'Alumni' });
  });

  it('invalidates and closes the modal on success', async () => {
    render(<MintInviteButton />);
    fireEvent.click(screen.getByTestId('mint-invite-button'));
    expect(screen.getByTestId('mint-invite-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mint-invite-submit'));
    await act(async () => {
      await mocks.mintOpts.onSuccess?.(undefined, {});
    });
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('mint-invite-modal')).not.toBeInTheDocument();
  });

  it('Cancel closes the modal without firing the mutation', () => {
    render(<MintInviteButton />);
    fireEvent.click(screen.getByTestId('mint-invite-button'));
    fireEvent.click(screen.getByTestId('mint-invite-cancel'));
    expect(mocks.mintMutate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('mint-invite-modal')).not.toBeInTheDocument();
  });
});
