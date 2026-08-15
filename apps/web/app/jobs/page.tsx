import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerSession, getSessionRole } from '@app/auth';
import { JOB_STATES, type JobState } from '@app/db/schema';
import { getMemberCapabilities } from '@/lib/access';
import { PageHeader } from '@/components/PageHeader';
import { JobsList } from './jobs-list';

export const metadata = { title: 'Jobs' };

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function parseStateFilter(
  value: string | string[] | undefined,
): JobState | null {
  if (!value) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  return (JOB_STATES as readonly string[]).includes(raw)
    ? (raw as JobState)
    : null;
}

export default async function JobsPage({ searchParams }: PageProps) {
  const session = await getServerSession(await headers());
  if (!session?.user?.id) redirect('/login');
  const { role } = await getSessionRole(session.user.id);
  // ADR-015: the "My postings" section is a posting surface — gated on member
  // STATUS (alumni), orthogonal to role.
  const { canPost } = await getMemberCapabilities(session.user.id);
  const params = (await searchParams) ?? {};
  const stateFilter = parseStateFilter(params.state);

  return (
    <section className="space-y-8">
      <PageHeader title="Jobs" description="What's open right now." />
      <JobsList role={role} canPost={canPost} stateFilter={stateFilter} />
    </section>
  );
}
