import Link from 'next/link';
import { SignupForm } from './signup-form';

interface SignupPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const token = params.token ?? '';

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="mb-4 text-2xl font-semibold">Create your account</h1>
      {token ? (
        <SignupForm token={token} />
      ) : (
        <div role="alert" className="rounded border border-red-500 bg-red-50 p-4 text-red-900">
          Invite link is invalid or has been revoked.{' '}
          <Link href="/login" className="underline">
            Sign in instead
          </Link>
        </div>
      )}
    </main>
  );
}
