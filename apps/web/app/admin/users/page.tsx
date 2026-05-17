import { UserListTable } from '@/components/UserListTable';

export default function AdminUsersPage() {
  return (
    <section className="space-y-4" data-testid="admin-users">
      <header>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-muted-foreground">
          Chapter roster. Click a role chip to grant or demote.
        </p>
      </header>
      <UserListTable />
    </section>
  );
}
