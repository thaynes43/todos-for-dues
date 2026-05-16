import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerSession, getSessionRole } from '@app/auth';
import { ModerationQueue } from '@/components/ModerationQueue';

export default async function ModerationQueuePage() {
  const session = await getServerSession(await headers());
  if (!session?.user?.id) redirect('/login');
  const { role } = await getSessionRole(session.user.id);
  if (role !== 'Moderator' && role !== 'Admin') {
    return (
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">Forbidden</h1>
        <p className="text-sm text-muted-foreground">
          Moderators and Admins only.
        </p>
      </section>
    );
  }
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Moderation queue</h1>
      <p className="text-sm text-muted-foreground">
        Postings awaiting review, oldest first.
      </p>
      <ModerationQueue />
    </section>
  );
}
