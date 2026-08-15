import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from '@app/auth';
import { getMemberCapabilities } from '@/lib/access';
import { getServerCaller } from '@/lib/trpc-server';
import { JobStateBadge } from '@/components/JobStateBadge';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { cardLinkBase } from '@/components/ui/styles';
import { formatChapterLocal } from '@/lib/formatters';

export const metadata = { title: 'My enrollments' };

export default async function MyEnrollmentsPage() {
  const session = await getServerSession(await headers());
  if (!session?.user?.id) redirect('/login');
  // ADR-015: "my enrollments" is the claiming surface — gated on member STATUS
  // (active), orthogonal to role.
  const caps = await getMemberCapabilities(session.user.id);
  if (!caps.canClaim) redirect('/');

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
    <section className="space-y-8">
      <PageHeader
        title="My enrollments"
        description="Jobs you're signed up for, soonest first."
      />
      {sorted.length === 0 ? (
        <EmptyState bordered testId="my-enrollments-empty">
          You haven&apos;t enrolled in any jobs yet — the Jobs page has what&apos;s
          open.
        </EmptyState>
      ) : (
        <ul className="space-y-4" data-testid="my-enrollments-list">
          {sorted.map((j) => (
            <li
              key={j.id}
              className={cardLinkBase}
              data-testid="my-enrollments-row"
              data-job-id={j.id}
            >
              <Link href={`/jobs/${j.id}`} className="block p-6">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xl leading-tight font-semibold">
                      {j.description}
                    </p>
                    <p className="mt-1 text-sm opacity-70">
                      ${j.duesAmount} dues
                      {j.workDate ? (
                        <> · work date {formatChapterLocal(j.workDate)}</>
                      ) : null}
                    </p>
                  </div>
                  <JobStateBadge state={j.state} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
