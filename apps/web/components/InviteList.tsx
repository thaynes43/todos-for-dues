'use client';

import { useEffect, useRef, useState } from 'react';
import type { InviteTokenRole } from '@app/db/schema';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { formatChapterLocal } from '@/lib/formatters';
import { MintInviteButton } from './MintInviteButton';
import { RevokeInviteButton } from './RevokeInviteButton';

// The wire shape matches what tRPC's httpBatchLink delivers (Date → ISO
// string; no superjson transformer is configured — see lib/trpc-provider.tsx).
// The server caller emits Date objects, so the page serializes to ISO before
// hydrating.
export interface InviteRow {
  id: string;
  token: string;
  preselectedRole: InviteTokenRole;
  createdAt: string;
  createdByDisplayName: string | null;
}

const ROLE_CHIP_CLASSES: Record<InviteTokenRole, string> = {
  Active: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  Alumni: 'border-slate-300 bg-slate-50 text-slate-900',
};

function signupUrlFor(baseUrl: string, token: string): string {
  return `${baseUrl}/signup?token=${token}`;
}

export function InviteList({
  initialInvites,
  baseUrl,
}: {
  initialInvites: ReadonlyArray<InviteRow>;
  baseUrl: string;
}) {
  const query = trpc.invites.list.useQuery(undefined, {
    initialData: initialInvites as InviteRow[],
  });
  const rows = (query.data ?? []) as InviteRow[];

  return (
    <div className="space-y-4" data-testid="invite-list-root">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {rows.length} outstanding invite{rows.length === 1 ? '' : 's'}.
        </p>
        <MintInviteButton />
      </div>

      {rows.length === 0 ? (
        <p
          className="text-sm text-muted-foreground"
          data-testid="invite-list-empty"
        >
          No outstanding invites. Click &quot;Mint invite&quot; to create one.
        </p>
      ) : (
        <ul className="space-y-3" data-testid="invite-list">
          {rows.map((row) => (
            <InviteRowItem key={row.id} row={row} baseUrl={baseUrl} />
          ))}
        </ul>
      )}
    </div>
  );
}

function InviteRowItem({
  row,
  baseUrl,
}: {
  row: InviteRow;
  baseUrl: string;
}) {
  const url = signupUrlFor(baseUrl, row.token);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write rejected (e.g., insecure context). Surface nothing
      // here — the URL is still visible in the read-only field so the Admin
      // can copy it manually.
    }
  };

  return (
    <li
      data-testid="invite-list-row"
      data-invite-id={row.id}
      data-invite-token={row.token}
      className="rounded-lg border bg-card p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span
              data-testid="invite-list-role-chip"
              className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-medium ${ROLE_CHIP_CLASSES[row.preselectedRole]}`}
            >
              {row.preselectedRole}
            </span>
            <span className="text-muted-foreground">
              Created{' '}
              <time
                data-testid="invite-list-created-at"
                dateTime={row.createdAt}
              >
                {formatChapterLocal(row.createdAt)}
              </time>{' '}
              by{' '}
              <strong
                className="text-foreground"
                data-testid="invite-list-minter"
              >
                {row.createdByDisplayName ?? 'Unknown'}
              </strong>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              readOnly
              value={url}
              data-testid="invite-list-url"
              aria-label="Signup URL"
              className="min-w-0 flex-1 rounded border bg-muted/30 px-2 py-1 font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              data-testid="invite-list-copy"
            >
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
        </div>
        <RevokeInviteButton inviteId={row.id} />
      </div>
    </li>
  );
}
