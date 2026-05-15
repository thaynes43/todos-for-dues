import { LoginForm } from './login-form';
import { oidcEnabled } from '@app/auth';

interface LoginPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = params.error;
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="mb-4 text-2xl font-semibold">Sign in</h1>
      {error === 'hd_restriction' ? (
        <div
          role="alert"
          className="mb-4 rounded border border-yellow-500 bg-yellow-50 p-4 text-sm text-yellow-900"
        >
          Your Google account isn&apos;t part of this chapter&apos;s Workspace. Use
          the invite-link signup instead.
        </div>
      ) : null}
      <LoginForm ssoEnabled={oidcEnabled} />
    </main>
  );
}
