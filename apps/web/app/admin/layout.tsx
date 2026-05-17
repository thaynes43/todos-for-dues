import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerSession, getSessionRole } from '@app/auth';
import { getServerCaller } from '@/lib/trpc-server';
import { AdminNav } from '@/components/AdminNav';

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession(await headers());
  if (!session?.user?.id) redirect('/login');
  const { role } = await getSessionRole(session.user.id);
  if (role !== 'Admin') redirect('/');

  const caller = await getServerCaller();
  let disputedCount = 0;
  try {
    const disputes = await caller.admin.listDisputed();
    disputedCount = disputes.length;
  } catch {
    disputedCount = 0;
  }

  return (
    <div className="flex flex-col gap-6 md:flex-row" data-testid="admin-layout">
      <AdminNav disputedCount={disputedCount} />
      <section className="flex-1 space-y-4">{children}</section>
    </div>
  );
}
