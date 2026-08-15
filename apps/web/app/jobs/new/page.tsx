import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerSession } from '@app/auth';
import { getMemberCapabilities } from '@/lib/access';
import { PostJobForm } from '@/components/PostJobForm';
import { PageHeader } from '@/components/PageHeader';
import { StatusPrompt } from '@/components/StatusPrompt';

export const metadata = { title: 'Post a job' };

export default async function NewJobPage() {
  const session = await getServerSession(await headers());
  if (!session?.user?.id) redirect('/login');
  // ADR-015: posting is gated on member STATUS (alumni), not role.
  const caps = await getMemberCapabilities(session.user.id);
  if (!caps.canPost) {
    if (caps.undeclared) {
      return <StatusPrompt />;
    }
    // Status active — the claiming side.
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
