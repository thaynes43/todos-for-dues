import { AuditLogSearchForm } from './audit-log-search-form';
import { PageHeader } from '@/components/PageHeader';

export const metadata = { title: 'Job history' };

export default function AdminAuditLogPage() {
  return (
    <section className="space-y-8" data-testid="admin-audit-log-search">
      <PageHeader
        title="Job history"
        description="Look up a job's full timeline by its ID."
      />
      <AuditLogSearchForm />
    </section>
  );
}
