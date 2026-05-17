export default function AdminUsersPage() {
  return (
    <section className="space-y-4" data-testid="admin-users-shell">
      <header>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-muted-foreground">
          User list and role-grant controls — implemented in PLAN-012.
        </p>
      </header>
      <div
        className="rounded border bg-muted/30 p-4 text-sm text-muted-foreground"
        data-testid="admin-users-placeholder"
      >
        Users list — implemented in PLAN-012
      </div>
    </section>
  );
}
