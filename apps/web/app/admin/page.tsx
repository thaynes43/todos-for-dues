import { getServerCaller } from '@/lib/trpc-server';
import { AggregateCountsCards } from '@/components/AggregateCountsCards';

export default async function AdminDashboardPage() {
  const caller = await getServerCaller();
  const counts = await caller.admin.getAggregateCounts();

  return (
    <section className="space-y-4" data-testid="admin-dashboard">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Chapter-wide job counts by state. Click a card to filter the jobs list.
        </p>
      </header>
      <AggregateCountsCards counts={counts} />
    </section>
  );
}
