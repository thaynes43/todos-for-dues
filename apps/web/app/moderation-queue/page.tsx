import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerSession, getSessionRole } from '@app/auth';
import { PageHeader } from '@/components/PageHeader';
import { ModerationQueue } from '@/components/ModerationQueue';

export const metadata = { title: 'Moderation queue' };

export default async function ModerationQueuePage() {
  const session = await getServerSession(await headers());
  if (!session?.user?.id) redirect('/login');
  const { role } = await getSessionRole(session.user.id);
  if (role !== 'Moderator' && role !== 'Admin') {
    return (
      <section className="space-y-4">
        <PageHeader
          title="Moderators only"
          description="This queue is for Moderators and Admins."
        />
      </section>
    );
  }
  return (
    <section className="space-y-8">
      <PageHeader
        title="Moderation queue"
        description="Postings awaiting review, oldest first."
      />
      <ModerationQueue />
    </section>
  );
}
