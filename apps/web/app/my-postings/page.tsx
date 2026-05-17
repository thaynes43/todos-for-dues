import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession, getSessionRole } from '@app/auth';
import { getServerCaller } from '@/lib/trpc-server';
import { JobStateBadge } from '@/components/JobStateBadge';
import { formatChapterLocal } from '@/lib/formatters';

export default async function MyPostingsPage() {
  const session = await getServerSession(await headers());
  if (!session?.user?.id) redirect('/login');
  const { role } = await getSessionRole(session.user.id);
  if (role !== 'Alumni' && role !== 'Moderator' && role !== 'Admin') {
    redirect('/');
  }

  const caller = await getServerCaller();
  const rows = await caller.jobs.listMyPosted();

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">My postings</h1>
      <p className="text-sm text-muted-foreground">
        Your posted jobs, most-recent first. Rejected postings stay here so you
        can revisit the reason.
      </p>
      {rows.length === 0 ? (
        <p
          className="text-sm text-muted-foreground"
          data-testid="my-postings-empty"
        >
          You haven&apos;t posted any jobs yet.
        </p>
      ) : (
        <ul className="space-y-3" data-testid="my-postings-list">
          {rows.map((j) => (
            <li
              key={j.id}
              className="rounded-lg border bg-card p-4 shadow-sm"
              data-testid="my-postings-row"
              data-job-id={j.id}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link
                    href={`/jobs/${j.id}`}
                    className="font-medium hover:underline"
                  >
                    {j.description}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    Dues:{' '}
                    <strong className="text-foreground">${j.duesAmount}</strong>
                    {' · '}
                    Submitted: {formatChapterLocal(j.createdAt)}
                  </p>
                </div>
                <JobStateBadge state={j.state} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
