'use client';

import { useState, type FormEvent } from 'react';
import { INVITE_TOKEN_ROLES, type InviteTokenRole } from '@app/db/schema';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

// PLAN-014 §3 + PRD-003 R-11: privileged roles (Moderator, Admin) are NEVER
// minted via invite. The Zod guard in `invites.mint` + the DB CHECK enforce
// this at the boundary; the UI must also never present them.
const INVITE_ROLE_OPTIONS: ReadonlyArray<InviteTokenRole> = INVITE_TOKEN_ROLES;

export function MintInviteButton() {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<InviteTokenRole>('Active');
  const [flash, setFlash] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setRole('Active');
  };

  const mint = trpc.invites.mint.useMutation({
    onSuccess: async () => {
      await utils.invites.list.invalidate();
      setFlash('Invite minted');
      // Brief visual confirmation; matches the SettingsForm "Saved." pattern.
      setTimeout(() => setFlash(null), 2500);
      close();
    },
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (mint.isPending) return;
    mint.mutate({ preselectedRole: role });
  };

  return (
    <div className="flex items-center gap-2" data-testid="mint-invite-root">
      {flash ? (
        <span
          role="status"
          className="text-sm text-green-700"
          data-testid="mint-invite-flash"
        >
          {flash}
        </span>
      ) : null}
      <Button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="mint-invite-button"
      >
        Mint invite
      </Button>

      <Modal
        open={open}
        onClose={() => {
          if (!mint.isPending) close();
        }}
        title="Mint a new invite"
        testId="mint-invite-modal"
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Pre-selected role</legend>
            {INVITE_ROLE_OPTIONS.map((r) => (
              <label
                key={r}
                className="flex items-center gap-2 text-sm"
                data-testid={`mint-invite-role-${r}`}
              >
                <input
                  type="radio"
                  name="preselectedRole"
                  value={r}
                  checked={role === r}
                  onChange={() => setRole(r)}
                  disabled={mint.isPending}
                />
                <span>{r}</span>
              </label>
            ))}
          </fieldset>
          {mint.error ? (
            <p role="alert" className="text-sm text-red-700">
              {mint.error.message}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={mint.isPending}
              data-testid="mint-invite-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={mint.isPending}
              data-testid="mint-invite-submit"
            >
              {mint.isPending ? 'Minting…' : 'Generate invite'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
