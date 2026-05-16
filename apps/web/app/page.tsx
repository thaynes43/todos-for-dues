import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSession, getSessionRole } from '@app/auth';

export default async function LandingPage() {
  const session = await getServerSession(await headers());
  if (!session?.user?.id) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold">TODOs for Dues</h1>
        <p className="text-sm text-muted-foreground">
          Per-chapter dues-credit job board.
        </p>
        <p className="text-sm">
          <Link href="/login" className="underline">
            Sign in
          </Link>{' '}
          to continue.
        </p>
      </section>
    );
  }

  const { role } = await getSessionRole(session.user.id);
  if (role === 'Moderator') redirect('/moderation-queue');
  redirect('/jobs');
}
