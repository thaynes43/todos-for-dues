import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerSession, getSessionRole } from '@app/auth';
import { ProfileRoleSection } from './ProfileRoleSection';

export default async function ProfilePage() {
  const session = await getServerSession(await headers());
  if (!session?.user?.id) redirect('/login');
  const { role, displayName } = await getSessionRole(session.user.id);
  const email = session.user.email;

  return (
    <section className="space-y-6" data-testid="profile-page">
      <header>
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Your account details and self-service role change.
        </p>
      </header>
      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium">Display name</dt>
          <dd
            className="text-muted-foreground"
            data-testid="profile-display-name"
          >
            {displayName}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Email</dt>
          <dd className="text-muted-foreground" data-testid="profile-email">
            {email}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Current role</dt>
          <dd className="text-muted-foreground" data-testid="profile-role">
            {role}
          </dd>
        </div>
      </dl>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Change your role</h2>
        <p className="text-xs text-muted-foreground">
          Self-service is limited to non-privileged roles. Moderators and Admins
          appear here only as the current role; ask an Admin to grant a
          privileged role.
        </p>
        <ProfileRoleSection role={role} />
      </section>
    </section>
  );
}
