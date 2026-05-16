import Link from 'next/link';
import type { JobState } from '@app/db/schema';
import { JobStateBadge } from './JobStateBadge';

export interface JobCardProps {
  id: string;
  description: string;
  duesAmount: string;
  recommendedPeopleCount: number;
  state: JobState;
}

export function JobCard({
  id,
  description,
  duesAmount,
  recommendedPeopleCount,
  state,
}: JobCardProps) {
  return (
    <li className="rounded-lg border bg-card p-4 shadow-sm">
      <Link href={`/jobs/${id}`} className="block space-y-2 hover:underline">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium leading-tight">{description}</p>
          <JobStateBadge state={state} />
        </div>
        <p className="text-sm text-muted-foreground">
          Dues: <strong className="text-foreground">${duesAmount}</strong> · Recommended:{' '}
          <strong className="text-foreground">{recommendedPeopleCount}</strong> people
        </p>
      </Link>
    </li>
  );
}
