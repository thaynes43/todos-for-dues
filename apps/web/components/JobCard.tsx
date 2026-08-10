import Link from 'next/link';
import type { JobState } from '@app/db/schema';
import { cardLinkBase } from '@/components/ui/styles';
import { cn } from '@/lib/utils';
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
    <li className={cardLinkBase}>
      <Link href={`/jobs/${id}`} className="block space-y-2 p-6">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xl leading-tight font-semibold">{description}</p>
          <JobStateBadge state={state} />
        </div>
        <p className="text-sm opacity-70">
          ${duesAmount} dues · {recommendedPeopleCount}{' '}
          {recommendedPeopleCount === 1 ? 'person' : 'people'} recommended
        </p>
      </Link>
    </li>
  );
}
