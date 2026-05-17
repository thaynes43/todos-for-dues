'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function AuditLogSearchForm() {
  const router = useRouter();
  const [jobId, setJobId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = jobId.trim();
    if (!UUID_RE.test(trimmed)) {
      setError('Enter a valid job UUID.');
      return;
    }
    setError(null);
    router.push(`/admin/jobs/${trimmed}`);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      data-testid="audit-log-search-form"
    >
      <label className="flex-1 space-y-1">
        <span className="block text-sm font-medium">Job ID</span>
        <Input
          type="text"
          name="jobId"
          autoComplete="off"
          spellCheck={false}
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          placeholder="00000000-0000-0000-0000-000000000000"
          data-testid="audit-log-search-input"
          aria-invalid={error != null}
        />
        {error ? (
          <p
            role="alert"
            className="text-sm text-red-700"
            data-testid="audit-log-search-error"
          >
            {error}
          </p>
        ) : null}
      </label>
      <Button type="submit" data-testid="audit-log-search-submit">
        Find
      </Button>
    </form>
  );
}
