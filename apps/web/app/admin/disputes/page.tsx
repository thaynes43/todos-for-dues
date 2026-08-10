import { getServerCaller } from '@/lib/trpc-server';
import { DisputeCardList, type DisputeRow } from '@/components/DisputeCardList';
import { PageHeader } from '@/components/PageHeader';

export const metadata = { title: 'Disputes' };

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
    <section className="space-y-8" data-testid="admin-disputes">
      <PageHeader
        title="Disputes"
        description="Disputed jobs — resolve them here."
      />
      <DisputeCardList rows={rows} />
    </section>
  );
}
