import { LoginForm } from './login-form';
import { oidcEnabled } from '@app/auth';

interface LoginPageProps {
  searchParams: Promise<{ error?: string }>;
}

/**
 * ADR-013: sign-in is portal SSO only. Already signed in at sigoalumni.org?
 * This completes silently. Not signed in? The portal's members door opens
 * first, then you land back here.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = params.error?.toLowerCase();
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="mb-2 text-2xl font-semibold">Sign in</h1>
      <p className="mb-6 text-sm text-neutral-600">
        Dues runs on your Sigo Alumni account.
      </p>
      {error === 'membership_pending' ? (
        <div
          role="alert"
          data-testid="membership-pending"
          className="mb-4 rounded border border-yellow-500 bg-yellow-50 p-4 text-sm text-yellow-900"
        >
          Membership pending. Your sigoalumni.org account is in — it just needs
          a brother to verify it. Check back soon.
        </div>
      ) : error ? (
        <div
          role="alert"
          className="mb-4 rounded border border-red-500 bg-red-50 p-4 text-sm text-red-900"
        >
          Sign-in didn&apos;t go through. Try again.
        </div>
      ) : null}
      <LoginForm ssoEnabled={oidcEnabled} />
    </main>
  );
}
