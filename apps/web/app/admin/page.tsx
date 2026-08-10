import { getServerCaller } from '@/lib/trpc-server';
import { PageHeader } from '@/components/PageHeader';

export const metadata = { title: 'Admin' };
import { AggregateCountsCards } from '@/components/AggregateCountsCards';

export default async function AdminDashboardPage() {
  const caller = await getServerCaller();
  const counts = await caller.admin.getAggregateCounts();

  return (
    <section className="space-y-8" data-testid="admin-dashboard">
      <PageHeader
        title="Dashboard"
        description="Job counts by state — pick a card to see the list."
      />
      <AggregateCountsCards counts={counts} />
    </section>
  );
}
