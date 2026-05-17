import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession, getSessionRole } from '@app/auth';
import { getServerCaller } from '@/lib/trpc-server';
import { JobStateBadge } from '@/components/JobStateBadge';
import { formatChapterLocal } from '@/lib/formatters';

export default async function MyEnrollmentsPage() {
  const session = await getServerSession(await headers());
  if (!session?.user?.id) redirect('/login');
  const { role } = await getSessionRole(session.user.id);
  if (role !== 'Active') redirect('/');

  const caller = await getServerCaller();
  const rows = await caller.jobs.listMyEnrolled();

  // PRD-004 R-06: locked jobs ordered by work_date asc (soonest first); other
  // states ordered by enrollment time (oldest first).
  const sorted = [...rows].sort((a, b) => {
    const aLocked = a.state === 'locked' && a.workDate != null;
    const bLocked = b.state === 'locked' && b.workDate != null;
    if (aLocked && !bLocked) return -1;
    if (!aLocked && bLocked) return 1;
    if (aLocked && bLocked) {
      return (
        new Date(a.workDate as Date | string).getTime() -
        new Date(b.workDate as Date | string).getTime()
      );
    }
    return (
      new Date(a.enrolledAt as Date | string).getTime() -
      new Date(b.enrolledAt as Date | string).getTime()
    );
  });

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">My enrollments</h1>
      <p className="text-sm text-muted-foreground">
        Jobs you&apos;ve enrolled in. Locked jobs come first, soonest date
        first; otherwise ordered by when you signed up.
      </p>
      {sorted.length === 0 ? (
        <p
          className="text-sm text-muted-foreground"
          data-testid="my-enrollments-empty"
        >
          You haven&apos;t enrolled in any jobs yet.
        </p>
      ) : (
        <ul className="space-y-3" data-testid="my-enrollments-list">
          {sorted.map((j) => (
            <li
              key={j.id}
              className="rounded-lg border bg-card p-4 shadow-sm"
              data-testid="my-enrollments-row"
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
                    {j.workDate ? (
                      <>
                        {' · '}Work date: {formatChapterLocal(j.workDate)}
                      </>
                    ) : null}
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
