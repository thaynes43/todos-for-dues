'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';
import type { JobState } from '@app/db/schema';

type ContactKind = 'email' | 'phone';

export interface EditableJobSnapshot {
  id: string;
  state: JobState;
  description: string;
  duesAmount: string;
  recommendedPeopleCount: number;
  posterContactKind?: 'email' | 'phone';
  posterContactValue?: string;
  location?: string;
  estimatedDurationHours?: string;
  additionalNotes?: string | null;
}

function isLikelyPhone(value: string): boolean {
  const cleaned = value.replace(/[^\d+]/g, '');
  return cleaned.length >= 7;
}

// PRD-011 R-01/R-02 — only render the Edit button when the job is in an
// editable state. Server-side enforces R-04 regardless.
export const EDITABLE_STATES: ReadonlySet<JobState> = new Set([
  'awaiting_moderation',
  'approved',
  'enrollment_open',
]);

export function EditJobForm({ job }: { job: EditableJobSnapshot }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);

  const [description, setDescription] = useState(job.description);
  const [duesAmount, setDuesAmount] = useState<string>(job.duesAmount);
  const [recommendedPeopleCount, setRecommendedPeopleCount] = useState<string>(
    String(job.recommendedPeopleCount),
  );
  const [contactKind, setContactKind] = useState<ContactKind>(
    job.posterContactKind ?? 'email',
  );
  const [contactValue, setContactValue] = useState<string>(job.posterContactValue ?? '');
  const [location, setLocation] = useState<string>(job.location ?? '');
  const [durationHours, setDurationHours] = useState<string>(
    job.estimatedDurationHours ?? '',
  );
  const [additionalNotes, setAdditionalNotes] = useState<string>(
    job.additionalNotes ?? '',
  );
  const [showDemoteBanner, setShowDemoteBanner] = useState(false);

  const edit = trpc.jobs.edit.useMutation({
    onSuccess: async (result) => {
      await utils.jobs.getById.invalidate({ jobId: job.id });
      await utils.jobs.listMyPosted.invalidate();
      // Material edit out of approved|enrollment_open lands on awaiting_moderation;
      // surface the banner so the poster knows re-review is in flight.
      if (result.state === 'awaiting_moderation' && job.state !== 'awaiting_moderation') {
        setShowDemoteBanner(true);
      }
      setOpen(false);
      // Stale-page invariant (MVP-FIX-A): force the server component on the
      // job detail page to re-fetch + re-render.
      router.refresh();
    },
  });

  const dues = parseFloat(duesAmount);
  const count = parseInt(recommendedPeopleCount, 10);
  const duration = parseFloat(durationHours);

  const errors = useMemo(() => {
    const out: {
      description?: string;
      duesAmount?: string;
      count?: string;
      contactValue?: string;
      location?: string;
      duration?: string;
      notes?: string;
    } = {};
    if (description.trim().length === 0) out.description = 'Description is required.';
    if (!Number.isFinite(dues) || dues <= 0) out.duesAmount = 'Dues must be greater than 0.';
    if (!Number.isInteger(count) || count < 1) out.count = 'Recommended count must be ≥ 1.';
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
    if (additionalNotes.length > 500) out.notes = 'Notes must be 500 characters or fewer.';
    return out;
  }, [
    description,
    dues,
    count,
    contactKind,
    contactValue,
    location,
    duration,
    additionalNotes,
  ]);

  const valid = Object.keys(errors).length === 0;

  // Build a partial edits payload containing only fields the user actually
  // changed (cheap optimization; the server also recomputes the diff).
  const buildEdits = (): Record<string, unknown> => {
    const edits: Record<string, unknown> = {};
    if (description.trim() !== job.description) edits.description = description.trim();
    if (Number.isFinite(dues) && Math.abs(dues - parseFloat(job.duesAmount)) > 1e-9) {
      edits.duesAmount = dues;
    }
    if (Number.isInteger(count) && count !== job.recommendedPeopleCount) {
      edits.recommendedPeopleCount = count;
    }
    if (contactKind !== (job.posterContactKind ?? 'email')) {
      edits.posterContactKind = contactKind;
    }
    if (contactValue.trim() !== (job.posterContactValue ?? '')) {
      edits.posterContactValue = contactValue.trim();
    }
    if (location.trim() !== (job.location ?? '')) edits.location = location.trim();
    const priorDuration = job.estimatedDurationHours
      ? parseFloat(job.estimatedDurationHours)
      : null;
    if (
      Number.isFinite(duration) &&
      (priorDuration == null || Math.abs(duration - priorDuration) > 1e-9)
    ) {
      edits.estimatedDurationHours = duration;
    }
    const trimmedNotes = additionalNotes.trim();
    const normalizedNotes = trimmedNotes.length === 0 ? null : trimmedNotes;
    if (normalizedNotes !== (job.additionalNotes ?? null)) {
      edits.additionalNotes = normalizedNotes;
    }
    return edits;
  };

  const hasAnyChange = Object.keys(buildEdits()).length > 0;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!valid || !hasAnyChange || edit.isPending) return;
    const edits = buildEdits();
    edit.mutate({ jobId: job.id, edits });
  };

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        data-testid="edit-job-button"
      >
        Edit job
      </Button>

      {showDemoteBanner ? (
        <div
          role="status"
          data-testid="edit-job-demote-banner"
          className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          Your edit will be re-reviewed by a moderator before becoming visible to others.
        </div>
      ) : null}

      <Modal
        open={open}
        onClose={() => {
          if (!edit.isPending) setOpen(false);
        }}
        title="Edit job"
        testId="edit-job-modal"
      >
        <form
          onSubmit={handleSubmit}
          className="space-y-4"
          data-testid="edit-job-form"
        >
          <label className="block space-y-1">
            <span className="block text-sm font-medium">Description</span>
            <Textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              data-testid="edit-description-input"
              aria-invalid={errors.description ? true : undefined}
            />
            {errors.description ? (
              <p role="alert" className="text-xs text-red-700">
                {errors.description}
              </p>
            ) : null}
          </label>

          <label className="block space-y-1">
            <span className="block text-sm font-medium">Dues amount ($)</span>
            <Input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              required
              value={duesAmount}
              onChange={(e) => setDuesAmount(e.target.value)}
              data-testid="edit-dues-input"
              aria-invalid={errors.duesAmount ? true : undefined}
            />
            {errors.duesAmount ? (
              <p role="alert" className="text-xs text-red-700">
                {errors.duesAmount}
              </p>
            ) : null}
          </label>

          <label className="block space-y-1">
            <span className="block text-sm font-medium">Recommended people</span>
            <Input
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              required
              value={recommendedPeopleCount}
              onChange={(e) => setRecommendedPeopleCount(e.target.value)}
              data-testid="edit-recommended-input"
              aria-invalid={errors.count ? true : undefined}
            />
            {errors.count ? (
              <p role="alert" className="text-xs text-red-700">
                {errors.count}
              </p>
            ) : null}
          </label>

          <label className="block space-y-1">
            <span className="block text-sm font-medium">Contact type</span>
            <select
              data-testid="edit-contact-kind"
              value={contactKind}
              onChange={(e) => setContactKind(e.target.value as ContactKind)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="email">Email</option>
              <option value="phone">Phone</option>
            </select>
          </label>

          <label className="block space-y-1">
            <span className="block text-sm font-medium">
              {contactKind === 'email' ? 'Contact email' : 'Contact phone'}
            </span>
            <Input
              type="text"
              inputMode={contactKind === 'phone' ? 'tel' : 'email'}
              value={contactValue}
              onChange={(e) => setContactValue(e.target.value)}
              data-testid="edit-contact-value"
              aria-invalid={errors.contactValue ? true : undefined}
            />
            {errors.contactValue ? (
              <p role="alert" className="text-xs text-red-700">
                {errors.contactValue}
              </p>
            ) : null}
          </label>

          <label className="block space-y-1">
            <span className="block text-sm font-medium">Location</span>
            <Input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              data-testid="edit-location"
              aria-invalid={errors.location ? true : undefined}
            />
            {errors.location ? (
              <p role="alert" className="text-xs text-red-700">
                {errors.location}
              </p>
            ) : null}
          </label>

          <label className="block space-y-1">
            <span className="block text-sm font-medium">Estimated duration (hours)</span>
            <Input
              type="number"
              inputMode="decimal"
              min="0.25"
              max="24"
              step="0.25"
              value={durationHours}
              onChange={(e) => setDurationHours(e.target.value)}
              data-testid="edit-duration"
              aria-invalid={errors.duration ? true : undefined}
            />
            {errors.duration ? (
              <p role="alert" className="text-xs text-red-700">
                {errors.duration}
              </p>
            ) : null}
          </label>

          <label className="block space-y-1">
            <span className="block text-sm font-medium">Additional notes (optional)</span>
            <Textarea
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              maxLength={500}
              data-testid="edit-notes"
            />
            {errors.notes ? (
              <p role="alert" className="text-xs text-red-700">
                {errors.notes}
              </p>
            ) : null}
          </label>

          {edit.error ? (
            <p role="alert" data-testid="edit-job-error" className="text-sm text-red-700">
              {edit.error.message}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={edit.isPending}
              data-testid="edit-job-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!valid || !hasAnyChange || edit.isPending}
              data-testid="edit-submit"
            >
              {edit.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
