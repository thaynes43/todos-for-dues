import { headers } from 'next/headers';
import { getServerCaller } from '@/lib/trpc-server';
import { InviteList } from '@/components/InviteList';

// The Admin role-gate is inherited from apps/web/app/admin/layout.tsx — no
// re-check here. Reading request headers makes this route dynamic-by-default
// (Next.js 16 marks the segment uncached when `headers()` is awaited), so no
// explicit `export const dynamic` is needed — same pattern as the admin
// layout's own headers() call.

export default async function AdminInvitesPage() {
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host') ?? 'localhost:3000';
  const baseUrl = `${proto}://${host}`;

  const caller = await getServerCaller();
  const rows = await caller.invites.list();
  // Serialize Date → ISO string so the payload matches what tRPC's
  // httpBatchLink would deliver to the client (no superjson transformer
  // configured; see lib/trpc-provider.tsx).
  const initialInvites = rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <section className="space-y-4" data-testid="admin-invites">
      <header>
        <h1 className="text-2xl font-semibold">Invites</h1>
        <p className="text-sm text-muted-foreground">
          Mint single-use invite links for new chapter members. Each link can
          be redeemed exactly once; revoke at any time to stop a link from
          working.
        </p>
      </header>
      <InviteList initialInvites={initialInvites} baseUrl={baseUrl} />
    </section>
  );
}
