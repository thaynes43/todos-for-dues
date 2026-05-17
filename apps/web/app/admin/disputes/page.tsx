import { getServerCaller } from '@/lib/trpc-server';
import { DisputeCardList, type DisputeRow } from '@/components/DisputeCardList';

export default async function AdminDisputesPage() {
  const caller = await getServerCaller();
  const disputes = await caller.admin.listDisputed();

  const rows: DisputeRow[] = disputes.map((d) => ({
    id: d.id,
    description: d.description,
    disputeReason: d.disputeReason,
    disputer: d.disputer,
    disputedAt: d.disputedAt,
  }));

  return (
    <section className="space-y-4" data-testid="admin-disputes">
      <header>
        <h1 className="text-2xl font-semibold">Disputes</h1>
        <p className="text-sm text-muted-foreground">
          Jobs currently in the disputed state. Resolve in-place; the row
          disappears once the resolution is recorded.
        </p>
      </header>
      <DisputeCardList rows={rows} />
    </section>
  );
}
