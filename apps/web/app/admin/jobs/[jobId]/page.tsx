import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getServerSession, getSessionRole } from '@app/auth';
import { getServerCaller } from '@/lib/trpc-server';
import { JobDetailView, type JobForDetailView } from '@/components/JobDetailView';
import {
  AuditLogTable,
  type AuditTransition,
} from '@/components/AuditLogTable';

interface PageProps {
  params: Promise<{ jobId: string }>;
}

export default async function AdminJobAuditPage({ params }: PageProps) {
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

  const rawHistory = await caller.jobs.getHistory({ jobId });

  const actorIds = Array.from(
    new Set(
      rawHistory
        .map((t) => t.actorId)
        .filter((id): id is string => typeof id === 'string'),
    ),
  );
  const actors: Array<{
    id: string;
    displayName: string | null;
    role: string | null;
  }> = await Promise.all(
    actorIds.map(async (id) => {
      try {
        // Admin-only page; role comes from the admin-gated projection (S-M1).
        const u = await caller.users.getByIdAdmin({ userId: id });
        return {
          id,
          displayName: u.displayName ?? null,
          role: u.role ?? null,
        };
      } catch {
        return { id, displayName: null, role: null };
      }
    }),
  );
  const actorMap = new Map(actors.map((a) => [a.id, a]));

  const transitions: AuditTransition[] = rawHistory.map((t) => {
    const actor = t.actorId ? actorMap.get(t.actorId) : undefined;
    return {
      id: t.id,
      jobId: t.jobId,
      fromState: t.fromState,
      toState: t.toState,
      actorId: t.actorId,
      actorKind: t.actorKind,
      actorDisplayName: actor?.displayName ?? null,
      actorRole: actor?.role ?? null,
      note: t.note,
      createdAt: t.createdAt,
    };
  });

  return (
    <section className="space-y-6" data-testid="admin-job-detail">
      <JobDetailView
        job={job}
        viewer={{ id: session.user.id, role }}
        rosterNames={rosterNames}
        treasurerRecipient={treasurerRecipient}
      />
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Audit log</h2>
        <AuditLogTable transitions={transitions} />
      </section>
    </section>
  );
}
