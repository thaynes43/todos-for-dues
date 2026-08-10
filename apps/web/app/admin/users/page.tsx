import { UserListTable } from '@/components/UserListTable';
import { PageHeader } from '@/components/PageHeader';

export const metadata = { title: 'Users' };

export default function AdminUsersPage() {
  return (
    <section className="space-y-8" data-testid="admin-users">
      <PageHeader
        title="Users"
        description="Everyone in the chapter — tap a role to change it."
      />
      <UserListTable />
    </section>
  );
}
