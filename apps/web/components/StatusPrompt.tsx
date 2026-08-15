import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { buttonStyles } from '@/components/ui/styles';

/**
 * ADR-015 — shown when a member has no declared status (undeclared, no registry
 * row, or portal unavailable): they can neither post nor claim until they pick
 * a side. One-word title, one-sentence description, links to /profile. No
 * mechanism jargon.
 */
export function StatusPrompt() {
  return (
    <section className="space-y-4" data-testid="status-prompt">
      <PageHeader
        title="Active or Alumni?"
        description="Pick a side on your profile to post jobs or pick them up."
      />
      <Link href="/profile" className={buttonStyles({ size: 'lg' })}>
        Go to profile
      </Link>
    </section>
  );
}
