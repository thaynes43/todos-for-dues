'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type ContactKind = 'email' | 'phone';

// Loose phone validation: at least 7 chars after stripping non-digit/+/space.
// We do not enforce regional formats per PRD-010 §6.1 (non-goal).
function isLikelyPhone(value: string): boolean {
  const cleaned = value.replace(/[^\d+]/g, '');
  return cleaned.length >= 7;
}

// PRD-010 R-05 — sanitize for `tel:` href: keep digits + leading `+` and spaces.
export function sanitizeTel(value: string): string {
  let s = value.trim();
  const leadingPlus = s.startsWith('+');
  s = s.replace(/[^\d ]/g, '');
  return (leadingPlus ? '+' : '') + s.trim();
}

export function PostJobForm({
  defaultContactEmail,
}: {
  defaultContactEmail: string;
}) {
  const router = useRouter();
  const post = trpc.jobs.post.useMutation({
    onSuccess: ({ jobId }) => router.push(`/jobs/${jobId}`),
  });

  const [description, setDescription] = useState('');
  const [duesAmount, setDuesAmount] = useState<string>('');
  const [recommendedPeopleCount, setRecommendedPeopleCount] = useState<string>('');
  const [contactKind, setContactKind] = useState<ContactKind>('email');
  const [contactValue, setContactValue] = useState<string>(defaultContactEmail);
  const [location, setLocation] = useState<string>('');
  const [durationHours, setDurationHours] = useState<string>('');
  const [additionalNotes, setAdditionalNotes] = useState<string>('');

  const dues = parseFloat(duesAmount);
  const count = parseInt(recommendedPeopleCount, 10);
  const duration = parseFloat(durationHours);

  const errors = useMemo(() => {
    const out: {
      contactValue?: string;
      location?: string;
      duration?: string;
      notes?: string;
    } = {};
    const cv = contactValue.trim();
    if (cv.length === 0) {
      out.contactValue = 'Contact value is required.';
    } else if (cv.length > 200) {
      out.contactValue = 'Contact value must be 200 characters or fewer.';
    } else if (contactKind === 'email' && !cv.includes('@')) {
      out.contactValue = 'Enter a valid email address.';
    } else if (contactKind === 'phone' && !isLikelyPhone(cv)) {
      out.contactValue = 'Enter a phone number (digits, +, and spaces).';
    }
    const loc = location.trim();
    if (loc.length === 0) out.location = 'Location is required.';
    else if (loc.length > 200) out.location = 'Location must be 200 characters or fewer.';
    if (!Number.isFinite(duration) || duration <= 0 || duration > 24) {
      out.duration = 'Estimated duration must be greater than 0 and at most 24 hours.';
    }
    if (additionalNotes.length > 500) {
      out.notes = 'Notes must be 500 characters or fewer.';
    }
    return out;
  }, [contactKind, contactValue, location, duration, additionalNotes]);

  const baseValid =
    description.trim().length > 0 &&
    Number.isFinite(dues) &&
    dues > 0 &&
    Number.isInteger(count) &&
    count >= 1;
  const valid = baseValid && Object.keys(errors).length === 0;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!valid) return;
    const trimmedNotes = additionalNotes.trim();
    post.mutate({
      description: description.trim(),
      duesAmount: dues,
      recommendedPeopleCount: count,
      posterContactKind: contactKind,
      posterContactValue: contactValue.trim(),
      location: location.trim(),
      estimatedDurationHours: duration,
      additionalNotes: trimmedNotes.length === 0 ? null : trimmedNotes,
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="grid gap-1.5 text-sm font-medium">
        <span>What needs doing?</span>
        <Textarea
          name="description"
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the job clearly so Actives know what to expect."
        />
      </label>

      <label className="grid gap-1.5 text-sm font-medium">
        <span>Dues amount ($)</span>
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

      <label className="grid gap-1.5 text-sm font-medium">
        <span>Recommended people</span>
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

      <label className="grid gap-1.5 text-sm font-medium">
        <span>Contact type</span>
        <select
          name="posterContactKind"
          data-testid="post-job-contact-kind"
          value={contactKind}
          onChange={(e) => setContactKind(e.target.value as ContactKind)}
          className="w-full rounded-lg border border-stone-300 bg-transparent px-3 py-2 text-base focus-visible:border-accent dark:border-stone-700"
        >
          <option value="email">Email</option>
          <option value="phone">Phone</option>
        </select>
      </label>

      <label className="grid gap-1.5 text-sm font-medium">
        <span>
          {contactKind === 'email' ? 'Contact email' : 'Contact phone'}
        </span>
        <Input
          name="posterContactValue"
          data-testid="post-job-contact-value"
          type="text"
          inputMode={contactKind === 'phone' ? 'tel' : 'email'}
          value={contactValue}
          onChange={(e) => setContactValue(e.target.value)}
          aria-invalid={errors.contactValue ? true : undefined}
        />
        {errors.contactValue ? (
          <p
            role="alert"
            data-testid="post-job-contact-value-error"
            className="text-sm text-red-700 dark:text-red-300"
          >
            {errors.contactValue}
          </p>
        ) : null}
      </label>

      <label className="grid gap-1.5 text-sm font-medium">
        <span>Location</span>
        <Input
          name="location"
          data-testid="post-job-location"
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          aria-invalid={errors.location ? true : undefined}
        />
        {errors.location ? (
          <p
            role="alert"
            data-testid="post-job-location-error"
            className="text-sm text-red-700 dark:text-red-300"
          >
            {errors.location}
          </p>
        ) : null}
      </label>

      <label className="grid gap-1.5 text-sm font-medium">
        <span>Estimated duration (hours)</span>
        <Input
          name="estimatedDurationHours"
          data-testid="post-job-duration"
          type="number"
          inputMode="decimal"
          min="0.25"
          max="24"
          step="0.25"
          value={durationHours}
          onChange={(e) => setDurationHours(e.target.value)}
          aria-invalid={errors.duration ? true : undefined}
        />
        {errors.duration ? (
          <p
            role="alert"
            data-testid="post-job-duration-error"
            className="text-sm text-red-700 dark:text-red-300"
          >
            {errors.duration}
          </p>
        ) : null}
      </label>

      <label className="grid gap-1.5 text-sm font-medium">
        <span>Additional notes <span className="font-normal opacity-60">(optional)</span></span>
        <Textarea
          name="additionalNotes"
          data-testid="post-job-notes"
          value={additionalNotes}
          onChange={(e) => setAdditionalNotes(e.target.value)}
          maxLength={500}
          placeholder="Anything else an Active should know (e.g., gate code, parking)."
        />
        {errors.notes ? (
          <p
            role="alert"
            data-testid="post-job-notes-error"
            className="text-sm text-red-700 dark:text-red-300"
          >
            {errors.notes}
          </p>
        ) : null}
      </label>

      {post.error ? (
        <div
          role="alert"
          className="rounded-lg bg-red-100 px-4 py-3 text-red-900 dark:bg-red-950 dark:text-red-200"
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
