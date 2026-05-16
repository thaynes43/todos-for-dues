'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export function PostJobForm() {
  const router = useRouter();
  const post = trpc.jobs.post.useMutation({
    onSuccess: ({ jobId }) => router.push(`/jobs/${jobId}`),
  });

  const [description, setDescription] = useState('');
  const [duesAmount, setDuesAmount] = useState<string>('');
  const [recommendedPeopleCount, setRecommendedPeopleCount] = useState<string>('');

  const dues = parseFloat(duesAmount);
  const count = parseInt(recommendedPeopleCount, 10);
  const valid =
    description.trim().length > 0 &&
    Number.isFinite(dues) &&
    dues > 0 &&
    Number.isInteger(count) &&
    count >= 1;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!valid) return;
    post.mutate({
      description: description.trim(),
      duesAmount: dues,
      recommendedPeopleCount: count,
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-1">
        <span className="block text-sm font-medium">What needs doing?</span>
        <Textarea
          name="description"
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the job clearly so Actives know what to expect."
        />
      </label>

      <label className="block space-y-1">
        <span className="block text-sm font-medium">Dues amount ($)</span>
        <Input
          name="duesAmount"
          type="number"
          inputMode="decimal"
          min="0.01"
          step="0.01"
          required
          value={duesAmount}
          onChange={(e) => setDuesAmount(e.target.value)}
        />
      </label>

      <label className="block space-y-1">
        <span className="block text-sm font-medium">Recommended people</span>
        <Input
          name="recommendedPeopleCount"
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          required
          value={recommendedPeopleCount}
          onChange={(e) => setRecommendedPeopleCount(e.target.value)}
        />
      </label>

      {post.error ? (
        <div
          role="alert"
          className="rounded border border-red-500 bg-red-50 p-3 text-sm text-red-900"
        >
          {post.error.message}
        </div>
      ) : null}

      <Button type="submit" disabled={!valid || post.isPending}>
        {post.isPending ? 'Posting…' : 'Post job'}
      </Button>
    </form>
  );
}
