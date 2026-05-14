---
id: DESIGN-006
title: UI components — pages, forms, lists, layouts (walking-skeleton + MVP)
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
related:
  prds: [PRD-001, PRD-002, PRD-003, PRD-004, PRD-005, PRD-006, PRD-007, PRD-008]
  adrs: [ADR-001, ADR-003]
  bounded_contexts: [BCC-01, BCC-02, BCC-03]
  aggregates: [ADC-01, ADC-02]
  flows: []
  designs: [DESIGN-001, DESIGN-002, DESIGN-003, DESIGN-004, DESIGN-005]
  parent_design: null
  supersedes: null
---

## 1. Purpose

Defines the page layout, route structure, and component composition for the MVP UI per ADR-001 (Next.js App Router + TypeScript + Tailwind + shadcn/ui). Each page consumes tRPC procedures from DESIGN-003 + Server Actions from DESIGN-004. The layout split (Active / Alumni / Moderator / Admin views) follows the role-conditional UI pattern called out in PRD-001 §6, PRD-002 §6, PRD-004 §6, PRD-005 §6, PRD-006 §6, PRD-007 §6.

> **Realises:** the §6 UX rules across all MVP PRDs; PRD-002 R-06 / PRD-004 R-06 / PRD-007 R-08 list views; the role-conditional rendering required by PRD-001 R-02 + PRD-002 + PRD-004 + PRD-007.
> **Definition of success:** an implementation agent can produce a working MVP UI from this design + DESIGN-003 + DESIGN-004 such that every PRD AC that surfaces a UI surface is verifiable by a Playwright E2E test.

## 2. Scope

### 2.1 In scope

- Next.js App Router file/folder layout for all MVP pages.
- Component composition (which shadcn/ui primitives + custom components compose each page).
- Shared layout components (RoleAwareNav, ChapterHeader, Footer).
- Form components for the 3 Server Actions (signup, login, password reset) + the tRPC-wired forms (post-job, lock, complete, dispute, etc.).
- The Admin view (`/admin/*`) sub-route layout per PRD-007 §6.
- Walking-skeleton-vs-MVP subset annotations.

### 2.2 Out of scope

| Concern | Owned by | Reason |
|---------|----------|--------|
| Visual design (colors, typography, spacing tokens beyond Tailwind defaults + shadcn/ui defaults) | Design system / brand pass | Defer until launch chapter has brand input; out of MVP scope. |
| Mobile-app layout (React Native / Expo) | Future ADR | MVP is web-only; mobile via the same tRPC procedures later. |
| Email templates | DESIGN-005 | React Email components live there. |
| Server-side auth flow | DESIGN-004 | UI calls into Server Actions / Better Auth routes. |
| Animations / transitions | Implementation polish | Not architectural. |

## 3. Architecture

```
apps/web/
  app/
    layout.tsx                    ← root layout; ChapterHeader + RoleAwareNav + Footer
    page.tsx                      ← landing — role-redirect or app-managed login link
    signup/
      page.tsx                    ← form (Server Action: signupWithInviteToken)
    login/
      page.tsx                    ← form (Server Action: signIn) + "Sign in with Google" button
    forgot-password/
      page.tsx                    ← form (Server Action: requestPasswordReset)
    reset-password/
      page.tsx                    ← Better Auth flow landing
    profile/
      page.tsx                    ← user profile + self-service role change (PRD-008 R-09)
    jobs/
      page.tsx                    ← list view; role-aware filtering
      new/
        page.tsx                  ← post-job form (Alumni; PRD-002)
      [jobId]/
        page.tsx                  ← job detail; role-aware controls
    my-postings/
      page.tsx                    ← Alumni's posted jobs list (PRD-002 R-11)
    my-enrollments/
      page.tsx                    ← Active's enrolled jobs list (PRD-004 R-06)
    moderation-queue/
      page.tsx                    ← Moderator-only queue (PRD-002 R-06)
    admin/
      layout.tsx                  ← Admin-only layout w/ left-nav (Dashboard / Disputes / Settings / Audit log / Users)
      page.tsx                    ← Dashboard (PRD-007 R-02)
      disputes/
        page.tsx                  ← Disputes drill-in (PRD-007 R-04)
      settings/
        page.tsx                  ← Chapter settings form (PRD-007 R-07/R-08)
      jobs/
        [jobId]/
          page.tsx                ← Per-job audit log timeline (PRD-007 R-06)
      users/
        page.tsx                  ← User list + role-grant (PRD-007 R-10 + PRD-008 R-08)
        [userId]/
          page.tsx                ← User detail + role-change history (PRD-008 R-10)
  components/
    ChapterHeader.tsx             ← top bar with chapter display name (from settings)
    RoleAwareNav.tsx              ← nav links filtered by ctx.userRole
    Footer.tsx                    ← static footer; static "Tipping is encouraged" cultural nudge per PRD-001 §6
    JobCard.tsx                   ← shared card representation for list views
    JobStateBadge.tsx             ← coloured pill for FSM state
    JobDetailView.tsx             ← role-conditional detail view (used by /jobs/[id] and /admin/jobs/[id])
    EnrollButton.tsx              ← Active-only; disabled when not enrollment_open
    UnenrollButton.tsx            ← Active-only; visible when enrolled + state is enrollment_open
    PostJobForm.tsx               ← Alumni; client component using useMutation(api.jobs.post)
    ApproveRejectButtons.tsx      ← Moderator-only; with rejection-reason modal
    LockJobForm.tsx               ← Alumni-poster; date picker + roster preview
    RescheduleButton.tsx          ← Alumni-poster
    CancelJobModal.tsx            ← Alumni-poster; with reason textarea
    CompleteJobForm.tsx           ← Alumni-poster; attendee checklist + computed-split preview
    RevertCompletionButton.tsx    ← Alumni-poster (when state == completed)
    MarkPaymentSentButton.tsx     ← Alumni-poster (when state == completed); single click + treasurer-recipient display
    ConfirmReceivedButton.tsx     ← Active OR Admin (when state == payment_sent); single click
    DisputeJobModal.tsx           ← Active OR Admin (when state == payment_sent); with reason
    ResolveDisputeModal.tsx       ← Admin-only (when state == disputed); 3 buttons (Closed / Cancelled / Payment-sent revert) + note
    AuditLogTable.tsx             ← Admin-only; chronological transitions with chapter-local timestamps
    AggregateCountsCards.tsx      ← Admin-only; per-state counts grid
    DisputeCardList.tsx           ← Admin-only
    SettingsForm.tsx              ← Admin-only; per-field save-on-blur
    UserListTable.tsx             ← Admin-only; role chip + grant menu
    RoleChangeDropdown.tsx        ← profile self-service (filtered to non-privileged)
    MinAdminErrorBanner.tsx       ← shown on min-Admin invariant error (PRD-008 R-06)
    TippingNudge.tsx              ← static one-line cultural-nudge per PRD-001 §6
  lib/
    trpc-client.ts                ← typed tRPC React client
    formatters.ts                 ← chapter-local date formatting + stateDisplayName() (per §4.5)
```

## 4. Detailed design

### 4.1 Routing and access control

The `app/` directory follows Next.js App Router conventions. **Per-route auth + role gating is enforced server-side** via the root `layout.tsx` redirect logic (no client-only gates):

```tsx
// app/layout.tsx
import { getServerSession } from '@app/auth';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(await headers());

  // Public routes: /, /signup, /login, /forgot-password, /reset-password
  // (Decided per-route via groups; sketch only here.)

  return (
    <html>
      <body>
        <ChapterHeader chapterName={session?.user.chapterName} />
        <RoleAwareNav role={session?.user.role ?? null} />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
```

Each role-gated route additionally checks `session.user.role` server-side and renders a 403 page if mismatched. **Never trust client-side role checks for gating** — they're for UI affordance only (showing/hiding buttons), not enforcement.

### 4.2 Walking-skeleton subset

For the first end-to-end slice, ship only:

| Page | Purpose | Walking-skeleton-only details |
|------|---------|-------------------------------|
| `/signup` | Invite-link signup | ✓ |
| `/login` | App-managed sign-in | ✓ |
| `/jobs` | Browse approved jobs | ✓ minimal: title + dues + count + state badge |
| `/jobs/new` | Post a new job | ✓ |
| `/jobs/[jobId]` | Job detail | ✓ with EnrollButton + LockJobForm (Alumni-poster) + CompleteJobForm + MarkPaymentSentButton + ConfirmReceivedButton |
| `/moderation-queue` | Approve | ✓ approve only — rejection flow lands later in MVP |
| `/admin` | Dashboard | ❌ deferred; Admin can use direct DB to verify |
| `/admin/users` | User list | ❌ deferred; bootstrap-admin via env var |
| `/admin/settings` | Settings | ❌ deferred; settings via env var only |

The walking skeleton is a **happy-path-only** vertical slice — every component listed in §3 that supports rejection / dispute / cancel / role grant / settings / audit log is **post-walking-skeleton MVP**.

### 4.3 Key component sketches

#### `components/JobDetailView.tsx`

The most role-conditional component. Renders different controls based on `session.user.role` and the job's relationship to the user.

```tsx
import type { Job } from '@app/api';
import { EnrollButton, UnenrollButton, LockJobForm, ... } from './';

export function JobDetailView({ job, viewer }: { job: Job; viewer: { id: string; role: Role; isEnrolled: boolean } }) {
  const isPoster = job.postedBy === viewer.id;
  const isEnrolled = viewer.isEnrolled;
  const isAdmin = viewer.role === 'Admin';
  const isMod = viewer.role === 'Moderator' || isAdmin;

  return (
    <article>
      <header>
        <h1>{job.description}</h1>
        <JobStateBadge state={job.state} />
      </header>

      <section>
        <p><strong>Dues:</strong> ${job.duesAmount}</p>
        <p><strong>Recommended:</strong> {job.recommendedPeopleCount} people</p>
        {job.workDate && <p><strong>Work date:</strong> {formatChapterLocal(job.workDate)}</p>}
        {(isEnrolled || isPoster || isMod) && job.roster && (
          <p><strong>Enrolled:</strong> {job.roster.map(a => a.displayName).join(', ')}</p>
        )}
        {!isEnrolled && !isPoster && !isMod && job.enrollmentCount !== undefined && (
          <p><strong>Enrolled:</strong> {job.enrollmentCount} people</p>
        )}
      </section>

      {/* Active controls */}
      {viewer.role === 'Active' && job.state === 'enrollment_open' && !isEnrolled && (
        <EnrollButton jobId={job.id} />
      )}
      {viewer.role === 'Active' && job.state === 'enrollment_open' && isEnrolled && (
        <UnenrollButton jobId={job.id} />
      )}
      {(isEnrolled || isAdmin) && job.state === 'payment_sent' && (
        <>
          <ConfirmReceivedButton jobId={job.id} />
          <DisputeJobModal jobId={job.id} />
        </>
      )}

      {/* Alumni-poster controls */}
      {isPoster && job.state === 'enrollment_open' && (
        <>
          <LockJobForm jobId={job.id} />
          <CancelJobModal jobId={job.id} />
        </>
      )}
      {isPoster && job.state === 'locked' && (
        <>
          <CompleteJobForm jobId={job.id} roster={job.roster} />
          <RescheduleButton jobId={job.id} />
          <CancelJobModal jobId={job.id} />
        </>
      )}
      {isPoster && job.state === 'completed' && (
        <>
          <MarkPaymentSentButton jobId={job.id} treasurerEmail={job.treasurerEmail} />
          <RevertCompletionButton jobId={job.id} />
        </>
      )}

      {/* Moderator controls */}
      {isMod && job.state === 'awaiting_moderation' && (
        <ApproveRejectButtons jobId={job.id} />
      )}

      {/* Admin dispute resolution */}
      {isAdmin && job.state === 'disputed' && (
        <ResolveDisputeModal jobId={job.id} />
      )}

      {/* Cancellation / rejection / dispute reasons (read-only) */}
      {job.rejectionReason && <Section title="Rejection reason" body={job.rejectionReason} />}
      {job.cancellationReason && <Section title="Cancellation reason" body={job.cancellationReason} />}
      {job.disputeReason && <Section title="Dispute reason" body={job.disputeReason} />}

      {/* Tipping nudge per PRD-001 §6 — static, never numeric */}
      {(job.state === 'closed' || job.state === 'payment_sent') && <TippingNudge />}
    </article>
  );
}
```

#### `components/PostJobForm.tsx`

Calls the `jobs.post` tRPC mutation per DESIGN-003 §4.4.

```tsx
'use client';
import { useState } from 'react';
import { trpc } from '@/lib/trpc-client';
import { useRouter } from 'next/navigation';

export function PostJobForm() {
  const router = useRouter();
  const post = trpc.jobs.post.useMutation({
    onSuccess: ({ jobId }) => router.push(`/jobs/${jobId}`),
  });

  const [description, setDescription] = useState('');
  const [duesAmount, setDuesAmount] = useState<number>();
  const [recommendedPeopleCount, setRecommendedPeopleCount] = useState<number>();

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      post.mutate({ description, duesAmount: duesAmount!, recommendedPeopleCount: recommendedPeopleCount! });
    }}>
      <Textarea required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What needs doing?" />
      <Input required type="number" min={0.01} step={0.01} value={duesAmount ?? ''} onChange={(e) => setDuesAmount(parseFloat(e.target.value))} placeholder="Dues amount ($)" />
      <Input required type="number" min={1} step={1} value={recommendedPeopleCount ?? ''} onChange={(e) => setRecommendedPeopleCount(parseInt(e.target.value, 10))} placeholder="Recommended people" />
      <Button type="submit" disabled={post.isPending}>Post job</Button>
      {post.error && <ErrorBanner message={post.error.message} />}
    </form>
  );
}
```

#### `components/MinAdminErrorBanner.tsx`

Shown when a role-change fails with code `MIN_ADMIN_INVARIANT_VIOLATED` per PRD-008 R-06.

```tsx
import Link from 'next/link';

export function MinAdminErrorBanner({ canPromote }: { canPromote: boolean }) {
  return (
    <div role="alert" className="rounded border border-amber-400 bg-amber-50 p-3">
      <strong>Cannot demote — this is the chapter's only Admin.</strong>
      <p>Demoting yourself now would leave the chapter without an Admin.</p>
      {canPromote && (
        <p>
          <Link href="/admin/users">Promote another user to Admin first →</Link>
        </p>
      )}
    </div>
  );
}
```

#### `components/Admin/AggregateCountsCards.tsx`

Calls `admin.getAggregateCounts` and renders a clickable grid.

```tsx
'use client';
import { trpc } from '@/lib/trpc-client';
import Link from 'next/link';

export function AggregateCountsCards() {
  const counts = trpc.admin.getAggregateCounts.useQuery();
  if (counts.isLoading) return <Skeleton />;
  if (!counts.data) return <ErrorBanner message="Failed to load" />;

  return (
    <div className="grid grid-cols-3 gap-4">
      {Object.entries(counts.data).map(([state, count]) => (
        <Link key={state} href={`/jobs?state=${state}`} className="border rounded p-4 hover:bg-slate-50">
          <div className="text-sm text-slate-500">{stateDisplayName(state)}</div>
          <div className="text-3xl">{count}</div>
        </Link>
      ))}
    </div>
  );
}
```

### 4.4 Form handling pattern

Two patterns:

**Server Actions** (≤3, per ADR-003): signup, login, forgot-password. These use Next.js's `<form action={serverActionFn}>` pattern; no client JS required to submit.

**tRPC mutations** (everything else): client components using `useMutation` from `@trpc/react-query`. Forms are interactive (validation as you type, submit-disabled-while-pending), error handling via the mutation's `error` state.

### 4.5 Loading + error + empty states

Every list / detail view must handle:
- **Loading:** shadcn `Skeleton` component
- **Error:** `ErrorBanner` component with the tRPC error message
- **Empty:** per-page custom empty state (e.g., "No jobs yet — be the first to post!" on `/jobs`)
- **Not authorized (403):** redirect to `/login` if unauthenticated; render `Forbidden` page if authenticated wrong-role

### 4.6 State-name display formatter (`stateDisplayName`)

The DB / tRPC / FSM-event form is `snake_case` per DESIGN-001 §4.1 (`awaiting_moderation`, `enrollment_open`, `payment_sent`). PRD-001 R-07 lists the **display** form with spaces and hyphens (`awaiting moderation`, `enrollment-open`, `payment-sent`). `stateDisplayName()` is the single conversion point — every place a job state is rendered (badges, audit-log rows, email subjects, aggregate-counts cards in `AggregateCountsCards.tsx`) goes through it. New states added later need one entry per state here and nowhere else.

```ts
// apps/web/lib/formatters.ts (also re-exported from packages/notifications for email subjects)
import type { JobState } from '@app/db/schema';

const JOB_STATE_DISPLAY: Record<JobState, string> = {
  awaiting_moderation: 'awaiting moderation',
  approved:            'approved',
  enrollment_open:     'enrollment-open',
  locked:              'locked',
  completed:           'completed',
  payment_sent:        'payment-sent',
  closed:              'closed',
  disputed:            'disputed',
  rejected:            'rejected',
  cancelled:           'cancelled',
};

export function stateDisplayName(state: JobState): string {
  return JOB_STATE_DISPLAY[state];
}
```

> **Why a map, not a `.replace('_', '-')` rule:** PRD-001 R-07 uses *both* a space (`"awaiting moderation"`) and a hyphen (`"enrollment-open"`). A regex transform would collapse them inconsistently. The explicit map is also the right place to add future i18n if it ever lands.

`JobStateBadge.tsx` always wraps `stateDisplayName(state)` in its visible label, never the raw `state` value. Same for `AggregateCountsCards.tsx` (already references `stateDisplayName(state)` at line 342 above).

### 4.7 Date / timezone display

All dates are rendered via `formatChapterLocal()` from `lib/formatters.ts`, which reads `chapter_settings.chapter_timezone` (defaults to `America/New_York`) per PRD-007 §6 / DESIGN-001 §4.8. Raw UTC ISO strings are in the HTML `<time datetime>` attribute for screen readers and forensic precision.

### 4.8 Tipping nudge (PRD-001 §6 + Q-06)

The `TippingNudge` component is a static, non-numeric one-liner shown on the job detail view when the job is in `payment_sent` or `closed`. **Never numeric** — exactly per Q-06's resolution.

```tsx
export function TippingNudge() {
  return (
    <p className="text-sm text-slate-600 italic">
      Tipping is encouraged when work goes above and beyond. (Send directly to the Active via Venmo or other channel.)
    </p>
  );
}
```

## 5. Migration / data shape

N/A — UI doesn't own data.

## 6. API contracts

UI components are consumers of:
- DESIGN-003 tRPC procedures (every component listed in §3 either calls a procedure or composes ones that do).
- DESIGN-004 Server Actions (signup / login / forgot-password forms).

No new APIs introduced here.

## 7. Error handling

| Source | UI surface |
|--------|------------|
| tRPC `UNAUTHORIZED` | redirect to `/login` (App Router middleware) |
| tRPC `FORBIDDEN` | render `<Forbidden />` page (or hide the affordance entirely if known at render time) |
| tRPC `NOT_FOUND` | render `<NotFound />` page |
| tRPC `BAD_REQUEST` (validation) | inline form error citing the field |
| tRPC `CONFLICT` (concurrent transition) | toast: "Someone else just acted on this job — refresh to see the latest" |
| tRPC `UNPROCESSABLE_CONTENT` with `MIN_ADMIN_INVARIANT_VIOLATED` | render `<MinAdminErrorBanner />` per PRD-008 R-06 |
| Network error | toast: "Connection problem — try again" |
| Server Action error | inline form error |

## 8. Testing approach

- **Unit / component tests** in `apps/web/__tests__/components/`: render each component with mocked tRPC + assert basic affordance presence.
- **Playwright E2E** in `apps/web/e2e/`:
  - `walking-skeleton.spec.ts`: full happy-path job loop click-through (signup → post → approve → enroll → lock → complete → payment-sent → confirm-received). Per project test-DB rule: against PG16 testcontainers via the dev server.
  - `dispute.spec.ts`: dispute path — Active disputes; Admin sees email-equivalent in the inbox view; Admin resolves.
  - `min-admin.spec.ts`: last-Admin self-demote attempt; UI shows MinAdminErrorBanner with link.
  - `role-management.spec.ts`: self-service Active → Alumni; Admin grant Moderator; Admin demote Moderator.
  - `admin-view.spec.ts`: Dashboard counts visible; Disputes drill-in; Settings save-on-blur; Audit log timeline.

Coverage target: every PRD AC that surfaces a UI is verifiable by an E2E or component test.

## 9. Open questions

| ID | Question | Owner | Needed by |
|----|----------|-------|-----------|
| Q-DSG-01 | Should `/jobs` be a single list with role-aware filters (e.g., Active sees enrollment-open + their enrolled; Alumni sees same + their posted) or separate per-role pages? Lean: **single list with role-aware filters** — fewer routes, less duplication. The `/my-postings` and `/my-enrollments` routes are role-scoped subsets of this. | Design | Pre-implementation |
| Q-DSG-02 | shadcn/ui dropdown menus vs. native `<select>` for the self-service role-change dropdown? Lean: **shadcn dropdown** — consistent styling with the rest of the app; native select on mobile is fine but inconsistent on desktop. | Design | Pre-implementation |
| Q-DSG-03 | Should the Admin view's left-nav badge the disputes count in real time (polling every N seconds) or only on page load? Lean: **on page load + after any mutation** — polling adds load for marginal benefit at MVP scale. | Design | Pre-implementation |
| Q-DSG-04 | Tipping nudge placement: only at `payment_sent` / `closed`, or also at `completed` to encourage tipping AT the moment of work? Lean: **at `completed` and onward** — that's when tipping is contextually relevant ("you just did the work, consider sending a tip"). | Design | Pre-implementation |
| Q-DSG-05 | "Sign in with Google" button: visible always (even when no SSO configured) or hidden when env vars missing? Lean: **conditional render** — server-side check on `OIDC_CLIENT_ID` + show only if set. | Design | Pre-implementation |

## 10. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. Full route + component layout for MVP. Walking-skeleton subset called out in §4.2 (~9 routes / minimal components for the happy-path slice). Role-conditional rendering pattern in `JobDetailView` covers the cross-PRD UX rules. Server Actions for the 3 auth forms; tRPC mutations for everything else. Date / timezone formatting via `chapter_settings.chapter_timezone`. Tipping nudge static, non-numeric per PRD-001 Q-06. 5 design follow-up questions. |
| 2026-05-14 | Tom Haynes | §4.6 added: `stateDisplayName()` formatter spec — single conversion point between DB/code snake_case (per DESIGN-001 §4.1) and PRD-001 R-07's mixed space/hyphen display form. Renumbered Date/Timezone (4.6→4.7) and Tipping nudge (4.7→4.8). §3 `formatters.ts` comment updated to mention the new formatter. |
