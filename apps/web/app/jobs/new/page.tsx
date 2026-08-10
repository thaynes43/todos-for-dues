import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerSession, getSessionRole } from '@app/auth';
import { PostJobForm } from '@/components/PostJobForm';
import { PageHeader } from '@/components/PageHeader';

export const metadata = { title: 'Post a job' };

export default async function NewJobPage() {
  const session = await getServerSession(await headers());
  if (!session?.user?.id) redirect('/login');
  const { role } = await getSessionRole(session.user.id);
  if (role === 'Active') {
    return (
      <section className="space-y-4">
        <PageHeader
          title="Alumni only"
          description="Posting jobs is for Alumni — the Jobs page has what you can pick up."
        />
      </section>
    );
  }
  // PRD-010 Q-PLN-03 / Trap 5: pre-fill the contact-value field with the
  // poster's account email from the server-side session — no client-side
  // useSession() round-trip.
  const defaultContactEmail = session.user.email ?? '';
  return (
    <section className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Post a job"
        description="Say what needs doing and what it pays toward dues."
      />
      <PostJobForm defaultContactEmail={defaultContactEmail} />
    </section>
  );
}
