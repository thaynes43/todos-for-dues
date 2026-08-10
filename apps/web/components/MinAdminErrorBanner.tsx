import Link from 'next/link';
import { StatusNote } from '@/components/StatusNote';

export interface MinAdminErrorBannerProps {
  canPromote: boolean;
  returnTo?: string;
}

export function MinAdminErrorBanner({
  canPromote,
  returnTo = '/profile',
}: MinAdminErrorBannerProps) {
  const href = `/admin/users?returnTo=${encodeURIComponent(returnTo)}`;
  return (
    <StatusNote
      tone="warning"
      testId="min-admin-error-banner"
      className="space-y-2 p-4"
    >
      <p className="font-semibold">
        Cannot demote — this is the chapter&apos;s only Admin.
      </p>
      <p>
        Demoting yourself now would leave the chapter without an Admin. To
        proceed, <strong>promote another user to Admin first</strong>, then come
        back and demote yourself.
      </p>
      {canPromote ? (
        <p>
          <Link
            href={href}
            data-testid="min-admin-error-banner-link"
            className="font-medium underline underline-offset-4"
          >
            Promote another user to Admin first →
          </Link>
        </p>
      ) : null}
    </StatusNote>
  );
}
