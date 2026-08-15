import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerSession, getSessionRole } from '@app/auth';
import { PageHeader } from '@/components/PageHeader';
import { tierPill } from '@/components/ui/styles';
import { ProfileStatusSection } from './ProfileStatusSection';

export const metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const session = await getServerSession(await headers());
  if (!session?.user?.id) redirect('/login');
  const { role, displayName } = await getSessionRole(session.user.id);
  const email = session.user.email;

  return (
    <section className="space-y-8" data-testid="profile-page">
      <PageHeader title="Profile" description="Your account and membership status." />
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-medium opacity-60">Display name</dt>
          <dd data-testid="profile-display-name">{displayName}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium opacity-60">Email</dt>
          <dd data-testid="profile-email">{email}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium opacity-60">Role</dt>
          <dd className="mt-0.5">
            {/* Role is set at the sigoalumni.org portal — it is NOT changeable
                here, and is fully orthogonal to the status below (ADR-015). */}
            <span className={tierPill} data-testid="profile-role">
              {role}
            </span>
          </dd>
        </div>
      </dl>

      {/* Member status is a portal roster fact, orthogonal to role: any member
          — Member, Moderator, or Admin — can be Active or Alumni. Active or
          Alumni? */}
      <section className="space-y-3">
        <h2 className="text-2xl font-semibold sm:text-3xl">Active or Alumni?</h2>
        <p className="max-w-2xl text-sm opacity-70">
          Actives do the jobs; Alumni post them.
        </p>
        <ProfileStatusSection />
      </section>
    </section>
  );
}
