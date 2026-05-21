import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerSession, getSessionRole } from '@app/auth';
import { PostJobForm } from '@/components/PostJobForm';

export default async function NewJobPage() {
  const session = await getServerSession(await headers());
  if (!session?.user?.id) redirect('/login');
  const { role } = await getSessionRole(session.user.id);
  if (role === 'Active') {
    return (
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">Forbidden</h1>
        <p className="text-sm text-muted-foreground">
          Only Alumni can post jobs.
        </p>
      </section>
    );
  }
  // PRD-010 Q-PLN-03 / Trap 5: pre-fill the contact-value field with the
  // poster's account email from the server-side session — no client-side
  // useSession() round-trip.
  const defaultContactEmail = session.user.email ?? '';
  return (
    <section className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Post a job</h1>
      <PostJobForm defaultContactEmail={defaultContactEmail} />
    </section>
  );
}
