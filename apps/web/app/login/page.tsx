import { LoginForm } from './login-form';
import { oidcEnabled } from '@app/auth';
import { PageHeader } from '@/components/PageHeader';
import { StatusNote } from '@/components/StatusNote';

export const metadata = { title: 'Sign in' };

interface LoginPageProps {
  searchParams: Promise<{ error?: string }>;
}

/**
 * ADR-013: sign-in is portal SSO only. Already signed in at sigoalumni.org?
 * This completes silently. Not signed in? The portal's members door opens
 * first, then you land back here. Styled to match that door: centered column,
 * one-sentence description, one green button.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = params.error?.toLowerCase();
  return (
    <section className="mx-auto max-w-md py-8 text-center sm:py-16">
      <PageHeader
        className="justify-center text-center"
        title="Sign in"
        description="Dues runs on your Sigo Alumni account."
      />
      {error === 'membership_pending' ? (
        <StatusNote
          tone="warning"
          testId="membership-pending"
          className="mt-6 text-left"
        >
          Your sigoalumni.org account is in — a brother just needs to okay it,
          so check back soon.
        </StatusNote>
      ) : error ? (
        <StatusNote tone="error" className="mt-6 text-left">
          Sign-in hit a snag. Try again, or email admin@sigoalumni.org.
        </StatusNote>
      ) : null}
      <div className="mt-8">
        <LoginForm ssoEnabled={oidcEnabled} />
      </div>
    </section>
  );
}
