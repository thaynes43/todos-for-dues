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
  const disputedCount = (await caller.admin.listDisputed()).length;

  return (
    <div className="flex flex-col gap-8 sm:flex-row" data-testid="admin-layout">
      <AdminNav disputedCount={disputedCount} />
      <section className="min-w-0 flex-1 space-y-4">{children}</section>
    </div>
  );
}
