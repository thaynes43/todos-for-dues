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

export const metadata = { title: 'My postings' };

export default async function MyPostingsPage() {
  const session = await getServerSession(await headers());
  if (!session?.user?.id) redirect('/login');
  // ADR-015: "my postings" is the posting surface — gated on member STATUS
  // (alumni), orthogonal to role.
  const caps = await getMemberCapabilities(session.user.id);
  if (!caps.canPost) {
    redirect('/');
  }

  const caller = await getServerCaller();
  const rows = await caller.jobs.listMyPosted();

  return (
    <section className="space-y-8">
      <PageHeader
        title="My postings"
        description="Your posted jobs, newest first."
      />
      {rows.length === 0 ? (
        <EmptyState bordered testId="my-postings-empty">
          You haven&apos;t posted any jobs yet — post one and it shows up here.
        </EmptyState>
      ) : (
        <ul className="space-y-4" data-testid="my-postings-list">
          {rows.map((j) => (
            <li
              key={j.id}
              className={cardLinkBase}
              data-testid="my-postings-row"
              data-job-id={j.id}
            >
              <Link href={`/jobs/${j.id}`} className="block p-6">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xl leading-tight font-semibold">
                      {j.description}
                    </p>
                    <p className="mt-1 text-sm opacity-70">
                      ${j.duesAmount} dues · submitted{' '}
                      {formatChapterLocal(j.createdAt)}
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
