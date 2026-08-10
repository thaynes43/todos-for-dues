import { notFound } from 'next/navigation';
import { getServerCaller } from '@/lib/trpc-server';
import { RoleChangeHistoryTable } from '@/components/RoleChangeHistoryTable';
import { tierPill } from '@/components/ui/styles';

interface PageProps {
  params: Promise<{ userId: string }>;
}

export default async function AdminUserDetailPage({ params }: PageProps) {
  const { userId } = await params;
  const caller = await getServerCaller();

  let user: {
    id: string;
    displayName: string;
    email: string;
    role: string;
  };
  try {
    user = await caller.users.getByIdAdmin({ userId });
  } catch {
    notFound();
  }

  return (
    <section className="space-y-8" data-testid="admin-user-detail">
      <header className="space-y-2">
        <h1
          className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          data-testid="admin-user-name"
        >
          {user.displayName}
        </h1>
        <p className="flex flex-wrap items-center gap-2 text-sm opacity-70">
          <span data-testid="admin-user-email">{user.email}</span>
          <span className={tierPill} data-testid="admin-user-role">
            {user.role}
          </span>
        </p>
      </header>
      <section className="space-y-3">
        <h2 className="text-2xl font-semibold sm:text-3xl">Role history</h2>
        <RoleChangeHistoryTable userId={user.id} />
      </section>
    </section>
  );
}
