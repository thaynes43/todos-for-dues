import Link from 'next/link';

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
    <div
      role="alert"
      data-testid="min-admin-error-banner"
      className="space-y-2 rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900"
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
            className="font-medium text-amber-900 underline hover:text-amber-700"
          >
            Promote another user to Admin first →
          </Link>
        </p>
      ) : null}
    </div>
  );
}
