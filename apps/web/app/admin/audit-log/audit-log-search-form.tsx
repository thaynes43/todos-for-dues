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
      setError('That doesn\u2019t look like a job ID \u2014 paste the whole thing.');
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
      <label className="grid flex-1 gap-1.5 text-sm font-medium">
        <span>Job ID</span>
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
            className="text-sm text-red-700 dark:text-red-300"
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
