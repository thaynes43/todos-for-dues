import { notFound } from 'next/navigation';
import { getServerCaller } from '@/lib/trpc-server';
import { RoleChangeHistoryTable } from '@/components/RoleChangeHistoryTable';

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
    user = await caller.users.getById({ userId });
  } catch {
    notFound();
  }

  return (
    <section className="space-y-6" data-testid="admin-user-detail">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold" data-testid="admin-user-name">
          {user.displayName}
        </h1>
        <p className="text-sm text-muted-foreground">
          <span data-testid="admin-user-email">{user.email}</span> ·{' '}
          <span data-testid="admin-user-role">{user.role}</span>
        </p>
      </header>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Role-change history</h2>
        <RoleChangeHistoryTable userId={user.id} />
      </section>
    </section>
  );
}
