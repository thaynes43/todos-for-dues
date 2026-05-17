import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  revokeMutate: vi.fn(),
  invalidate: vi.fn(),
  revokeOpts: {
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
      revoke: {
        useMutation: (opts: {
          onSuccess?: (data: unknown, variables: unknown) => void | Promise<void>;
        }) => {
          mocks.revokeOpts.onSuccess = opts.onSuccess;
          return {
            mutate: (input: { id: string }) => mocks.revokeMutate(input),
            isPending: false,
            error: null,
          };
        },
      },
    },
  },
}));

import { RevokeInviteButton } from '@/components/RevokeInviteButton';

beforeEach(() => {
  mocks.revokeMutate.mockClear();
  mocks.invalidate.mockClear();
  mocks.revokeOpts.onSuccess = undefined;
});

describe('<RevokeInviteButton>', () => {
  it('renders the trigger button; confirm dialog is closed initially', () => {
    render(<RevokeInviteButton inviteId="inv-1" />);
    expect(screen.getByTestId('revoke-invite-button')).toBeInTheDocument();
    expect(screen.queryByTestId('revoke-invite-modal')).not.toBeInTheDocument();
  });

  it('opens the confirm dialog on click', () => {
    render(<RevokeInviteButton inviteId="inv-1" />);
    fireEvent.click(screen.getByTestId('revoke-invite-button'));
    expect(screen.getByTestId('revoke-invite-modal')).toBeInTheDocument();
    expect(screen.getByTestId('revoke-invite-confirm')).toBeInTheDocument();
    expect(screen.getByTestId('revoke-invite-cancel')).toBeInTheDocument();
  });

  it('confirming fires revoke.mutate({ id })', () => {
    render(<RevokeInviteButton inviteId="inv-42" />);
    fireEvent.click(screen.getByTestId('revoke-invite-button'));
    fireEvent.click(screen.getByTestId('revoke-invite-confirm'));
    expect(mocks.revokeMutate).toHaveBeenCalledTimes(1);
    expect(mocks.revokeMutate).toHaveBeenCalledWith({ id: 'inv-42' });
  });

  it('Cancel closes the dialog WITHOUT firing the mutation', () => {
    render(<RevokeInviteButton inviteId="inv-42" />);
    fireEvent.click(screen.getByTestId('revoke-invite-button'));
    fireEvent.click(screen.getByTestId('revoke-invite-cancel'));
    expect(mocks.revokeMutate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('revoke-invite-modal')).not.toBeInTheDocument();
  });

  it('invalidates invites.list and closes the dialog on success', async () => {
    render(<RevokeInviteButton inviteId="inv-1" />);
    fireEvent.click(screen.getByTestId('revoke-invite-button'));
    fireEvent.click(screen.getByTestId('revoke-invite-confirm'));
    await act(async () => {
      await mocks.revokeOpts.onSuccess?.(undefined, {});
    });
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('revoke-invite-modal')).not.toBeInTheDocument();
  });
});
