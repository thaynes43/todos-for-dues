import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getServerSession, getSessionRole } from '@app/auth';
import { getServerCaller } from '@/lib/trpc-server';
import { JobDetailView, type JobForDetailView } from '@/components/JobDetailView';

interface PageProps {
  params: Promise<{ jobId: string }>;
}

export default async function JobDetailPage({ params }: PageProps) {
  const { jobId } = await params;
  const session = await getServerSession(await headers());
  if (!session?.user?.id) redirect('/login');
  const { role } = await getSessionRole(session.user.id);

  const caller = await getServerCaller();
  let job: JobForDetailView;
  try {
    job = (await caller.jobs.getById({ jobId })) as unknown as JobForDetailView;
  } catch {
    notFound();
  }

  let rosterNames: Array<{ activeId: string; displayName: string }> = [];
  if (job.roster) {
    rosterNames = await Promise.all(
      job.roster.map(async (r) => {
        const u = await caller.users.getById({ userId: r.activeId });
        return { activeId: r.activeId, displayName: u.displayName };
      }),
    );
  }

  let treasurerRecipient: string | null = null;
  if (job.state === 'completed' && job.postedBy === session.user.id) {
    try {
      const list = await caller.settings.list();
      const row = list.find((s) => s.key === 'treasurer_recipient_email');
      treasurerRecipient = (row?.value as string | undefined) ?? null;
    } catch {
      treasurerRecipient = null;
    }
  }

  return (
    <JobDetailView
      job={job}
      viewer={{ id: session.user.id, role }}
      rosterNames={rosterNames}
      treasurerRecipient={treasurerRecipient}
    />
  );
}
