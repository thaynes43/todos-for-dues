'use client';

import { useState, type FormEvent } from 'react';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

export function RevokeInviteButton({ inviteId }: { inviteId: string }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  const revoke = trpc.invites.revoke.useMutation({
    onSuccess: async () => {
      await utils.invites.list.invalidate();
      close();
    },
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (revoke.isPending) return;
    revoke.mutate({ id: inviteId });
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="revoke-invite-button"
      >
        Revoke
      </Button>

      <Modal
        open={open}
        onClose={() => {
          if (!revoke.isPending) close();
        }}
        title="Revoke this invite?"
        testId="revoke-invite-modal"
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-sm">
            The link will stop working immediately. Anyone who has the URL but
            has not yet redeemed it will see an &quot;invalid or revoked&quot;
            error.
          </p>
          {revoke.error ? (
            <p role="alert" className="text-sm text-red-700">
              {revoke.error.message}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={revoke.isPending}
              data-testid="revoke-invite-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={revoke.isPending}
              data-testid="revoke-invite-confirm"
            >
              {revoke.isPending ? 'Revoking…' : 'Revoke invite'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
