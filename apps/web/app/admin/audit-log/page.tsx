import { AuditLogSearchForm } from './audit-log-search-form';

export default function AdminAuditLogPage() {
  return (
    <section className="space-y-4" data-testid="admin-audit-log-search">
      <header>
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Find by job ID. The full timeline lives on the per-job page.
        </p>
      </header>
      <AuditLogSearchForm />
    </section>
  );
}
