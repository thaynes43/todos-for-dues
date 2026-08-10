import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSession, getSessionRole } from '@app/auth';
import { buttonStyles } from '@/components/ui/styles';

export default async function LandingPage() {
  const session = await getServerSession(await headers());
  if (!session?.user?.id) {
    return (
      <section className="py-8 sm:py-16">
        <p className="text-sm tracking-widest uppercase opacity-60">
          Sigo Alumni
        </p>
        {/* TODO(tom): working name — see layout.tsx metadata note. */}
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          Sigo Dues
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed opacity-80">
          Alumni post jobs, Actives do the work, and the dues get credited.
        </p>
        <div className="mt-8">
          <Link href="/login" className={buttonStyles({ size: 'lg' })}>
            Sign in
          </Link>
        </div>
      </section>
    );
  }

  const { role } = await getSessionRole(session.user.id);
  if (role === 'Moderator') redirect('/moderation-queue');
  redirect('/jobs');
}
