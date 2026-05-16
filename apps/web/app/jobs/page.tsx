import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerSession, getSessionRole } from '@app/auth';
import { JobsList } from './jobs-list';

export default async function JobsPage() {
  const session = await getServerSession(await headers());
  if (!session?.user?.id) redirect('/login');
  const { role } = await getSessionRole(session.user.id);
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Jobs</h1>
      <JobsList role={role} />
    </section>
  );
}
