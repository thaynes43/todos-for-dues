---
id: DESIGN-005
title: Notifications adapter — Resend + React Email
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
related:
  prds: [PRD-001, PRD-002, PRD-005, PRD-006]
  adrs: [ADR-005, ADR-010]
  bounded_contexts: [BCC-02]                     # invoked from BCC-02 transitions
  aggregates: [ADC-01]                            # afterCommit hooks fire from Job aggregate transitions
  flows: []
  designs: [DESIGN-001, DESIGN-002, DESIGN-003, DESIGN-004]
  parent_design: null
  supersedes: null
---

## 1. Purpose

Realises ADR-005 (Resend + React Email). Defines the typed `sendEmail()` adapter and the four MVP email templates that BCC-02 transitions and Better Auth (DESIGN-004) call into. Wraps Resend as a thin module so other contexts depend on a typed interface, not Resend's SDK shape — and so swapping providers later requires changing one file.

> **Realises:** PRD-005 R-07 (treasurer breakdown email); PRD-006 R-07 (admin dispute notification); PRD-002 R-12 (moderator-queue notification — added 2026-05-14); PRD-002 (Alumni rejection-reason notification — optional MVP); ADR-005 wiring; ADR-010 settings consumption (recipient addresses).
> **Definition of success:** an implementation agent can read this design + DESIGN-002 + DESIGN-003 + DESIGN-004 and produce a working notifications subsystem where every state-changing transition that requires an email triggers it via this adapter, with idempotent content (job_id keyed) and a clean failure mode (logs but doesn't fail the transition).

## 2. Scope

### 2.1 In scope

- The `sendEmail()` adapter (typed wrapper around Resend's SDK).
- Four React Email templates: `TreasurerBreakdown`, `AdminDispute`, `ModeratorNewPosting`, `AlumniRejection`.
- Per-template helper: `sendTreasurerEmail()`, `sendAdminDisputeEmail()`, `sendModeratorQueueEmail()`, `sendAlumniRejectionEmail()`.
- Inbound webhook route for Resend bounce/complaint suppression (per ADR-005 §Decision-outcome — "Webhook suppression for bounces/complaints").
- Idempotency strategy (job_id keying in subject + body).
- Failure handling per ADR-008 / DESIGN-002 `afterCommit` semantics (log-only, no transaction rollback).

### 2.2 Out of scope

| Concern | Owned by | Reason |
|---------|----------|--------|
| Triggering the emails (which transitions fire which) | DESIGN-002 + DESIGN-003 | Adapter is called by transition `afterCommit` hooks. |
| Recipient address provisioning | ADR-010 + DESIGN-001 (`chapter_settings` table) + DESIGN-003 (`settings` router) | Adapter reads via `getSetting()`. |
| Better Auth's password-reset email | DESIGN-004 | Better Auth manages internally; uses Resend via this adapter. |
| In-app notifications (toasts, push) | DESIGN-006 (UI) | Not email. |
| Per-user notification preferences | post-MVP | Not in scope. |

## 3. Architecture

```
packages/notifications/
  index.ts                        ← barrel: sendEmail, sendTreasurerEmail, etc.
  send-email.ts                   ← the typed Resend wrapper
  helpers/
    treasurer-breakdown.ts        ← sendTreasurerEmail()
    admin-dispute.ts              ← sendAdminDisputeEmail()
    moderator-new-posting.ts      ← sendModeratorQueueEmail()
    alumni-rejection.ts           ← sendAlumniRejectionEmail()
  templates/                      ← React Email components
    TreasurerBreakdown.tsx
    AdminDispute.tsx
    ModeratorNewPosting.tsx
    AlumniRejection.tsx
    _components/
      Layout.tsx                  ← shared header/footer
      Button.tsx
apps/web/
  app/api/webhooks/resend/route.ts ← inbound bounce/complaint webhook
```

```mermaid
flowchart LR
  Trans[transitionJob.afterCommit]
  Helpers[sendTreasurerEmail / etc.]
  Adapter[sendEmail]
  Templates[React Email render]
  Resend[Resend API]
  Recipient[Treasurer / Admin / etc.]

  Trans -->|invoke| Helpers
  Helpers -->|render template + recipient| Templates
  Templates -->|HTML + text| Adapter
  Adapter -->|API call| Resend
  Resend -->|deliver| Recipient
  Resend -.->|bounce / complaint| Webhook[/api/webhooks/resend]
  Webhook -->|update suppression list| DB[(suppressions table — TBD if needed)]
```

## 4. Detailed design

### 4.1 `packages/notifications/send-email.ts` — the adapter

```ts
import { Resend } from 'resend';
import type { ReactElement } from 'react';
import { render } from '@react-email/render';

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS ?? 'TODOs for Dues <noreply@todos-for-dues.app>';

export interface SendEmailInput {
  to: string;                          // single recipient (no batching in MVP)
  subject: string;
  template: ReactElement;              // a React Email component (renders to HTML + text)
  // For idempotency / dedup at the recipient end:
  idempotencyKey?: string;             // e.g., `job:${jobId}:payment_sent`
}

export async function sendEmail(input: SendEmailInput): Promise<{ id: string } | { skipped: true; reason: string }> {
  if (!process.env.RESEND_API_KEY) {
    // Dev / test environment — log instead of sending
    console.log(`[email:dev] to=${input.to} subject="${input.subject}"`);
    return { skipped: true, reason: 'no RESEND_API_KEY' };
  }

  const html = await render(input.template);
  const text = await render(input.template, { plainText: true });

  // Resend's idempotency feature (if available in SDK version used):
  const result = await resend.emails.send({
    from: FROM_ADDRESS,
    to: input.to,
    subject: input.subject,
    html,
    text,
    headers: input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : undefined,
  });

  if (result.error) throw new Error(`Resend error: ${result.error.message}`);
  return { id: result.data!.id };
}
```

> **Note on idempotency:** Resend's API supports an idempotency key on send; combined with our job_id keying, retries (e.g., from outbox if/when added) won't duplicate sends. Treasurer-side dedup is also doable by job_id in the subject.

### 4.2 `packages/notifications/helpers/treasurer-breakdown.ts` — PRD-005 R-07

```ts
import { db } from '@app/db';
import { jobs, jobEnrollments, users } from '@app/db/schema';
import { eq, and } from 'drizzle-orm';
import { sendEmail } from '../send-email';
import { TreasurerBreakdown } from '../templates/TreasurerBreakdown';
import { getSetting } from '@app/settings';

export async function sendTreasurerEmail(input: { jobId: string }) {
  // Fetch job + per-Active credit + display names
  const [job] = await db.select().from(jobs).where(eq(jobs.id, input.jobId));
  if (!job) throw new Error(`Job ${input.jobId} not found for treasurer email`);
  if (!job.perActiveDuesCredit) throw new Error(`Job ${input.jobId} has no per-Active credit map (was completion run?)`);

  // Resolve user_id → display_name
  const userIds = Object.keys(job.perActiveDuesCredit as Record<string, string>);
  const usersList = await db.select({ id: users.id, displayName: users.displayName }).from(users).where(/* in userIds */);
  const lineItems = userIds.map((id) => ({
    displayName: usersList.find((u) => u.id === id)?.displayName ?? '(unknown)',
    amount: (job.perActiveDuesCredit as Record<string, string>)[id],
  }));

  const recipient = await getSetting<string>('treasurer_recipient_email');
  const chapterName = await getSetting<string>('chapter_display_name');

  return sendEmail({
    to: recipient,
    subject: `${chapterName} — payment-sent for "${job.description.substring(0, 60)}"`,
    template: TreasurerBreakdown({
      jobDescription: job.description,
      jobId: job.id,
      totalAmount: job.duesAmount,
      lineItems,
      timestamp: new Date(),
    }),
    idempotencyKey: `job:${job.id}:payment_sent`,
  });
}
```

### 4.3 `packages/notifications/helpers/admin-dispute.ts` — PRD-006 R-07

```ts
import { db } from '@app/db';
import { jobs, users } from '@app/db/schema';
import { eq } from 'drizzle-orm';
import { sendEmail } from '../send-email';
import { AdminDispute } from '../templates/AdminDispute';
import { getSetting } from '@app/settings';

export async function sendAdminDisputeEmail(input: { jobId: string; disputerId: string; reason: string }) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, input.jobId));
  if (!job) throw new Error(`Job ${input.jobId} not found for admin dispute email`);

  const [disputer] = await db.select({ displayName: users.displayName, role: users.role }).from(users).where(eq(users.id, input.disputerId));

  const recipient = await getSetting<string>('admin_recipient_email');
  const chapterName = await getSetting<string>('chapter_display_name');
  const baseUrl = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';

  return sendEmail({
    to: recipient,
    subject: `${chapterName} — DISPUTE on "${job.description.substring(0, 60)}"`,
    template: AdminDispute({
      jobDescription: job.description,
      jobId: job.id,
      disputerDisplayName: disputer?.displayName ?? '(unknown)',
      disputerRole: disputer?.role ?? '(unknown)',
      reason: input.reason,
      adminViewUrl: `${baseUrl}/admin/jobs/${job.id}`,
    }),
    // No idempotency key — re-disputes (after Admin resolves to payment-sent) are legitimately separate events.
  });
}
```

### 4.4 `packages/notifications/helpers/moderator-new-posting.ts` — PRD-002 R-12

Mirror of `sendAdminDisputeEmail()` shape: one email per posting (no batching for MVP — see Q-DSG-04), sent to the single chapter-scoped recipient `moderators_recipient_email` (per Q-DSG-03; per-Moderator preferences are post-MVP).

```ts
import { db } from '@app/db';
import { jobs, users } from '@app/db/schema';
import { eq } from 'drizzle-orm';
import { sendEmail } from '../send-email';
import { ModeratorNewPosting } from '../templates/ModeratorNewPosting';
import { getSetting } from '@app/settings';

export async function sendModeratorQueueEmail(input: { jobId: string }) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, input.jobId));
  if (!job) throw new Error(`Job ${input.jobId} not found for moderator queue email`);

  const [poster] = await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, job.postedBy));

  const recipient = await getSetting<string>('moderators_recipient_email');
  const chapterName = await getSetting<string>('chapter_display_name');
  const baseUrl = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';

  return sendEmail({
    to: recipient,
    subject: `${chapterName} — new posting awaiting moderation: "${job.description.substring(0, 60)}"`,
    template: ModeratorNewPosting({
      jobDescription: job.description,
      jobId: job.id,
      posterDisplayName: poster?.displayName ?? '(unknown)',
      duesAmount: job.duesAmount,
      recommendedPeopleCount: job.recommendedPeopleCount,
      moderationQueueUrl: `${baseUrl}/moderation-queue`,
    }),
    idempotencyKey: `job:${job.id}:moderation_queue`,
  });
}
```

**Wiring:** invoked from `createJob()`'s `afterCommit` hook (DESIGN-002 §4.1.3 — `createJob` accepts an `afterCommit` callback symmetrical to `transitionJob`'s, with the same fire-and-forget swallow-on-failure semantics). Per Q-DSG-04, one email per posting; if MVP volume ever justifies batching, add a per-minute coalescer here without changing the call site.

### 4.5 `packages/notifications/helpers/alumni-rejection.ts` — optional MVP

```ts
export async function sendAlumniRejectionEmail(input: { jobId: string; reason: string }) {
  // Fetch job + posting Alumni
  // Send rejection-reason email to Alumni's address
  // Optional MVP per PRD-002 §10 release plan
}
```

### 4.6 React Email templates

#### `packages/notifications/templates/TreasurerBreakdown.tsx`

```tsx
import { Html, Body, Container, Heading, Text, Section, Row, Column, Hr } from '@react-email/components';
import { Layout } from './_components/Layout';

interface Props {
  jobDescription: string;
  jobId: string;
  totalAmount: string;
  lineItems: Array<{ displayName: string; amount: string }>;
  timestamp: Date;
}

export function TreasurerBreakdown({ jobDescription, jobId, totalAmount, lineItems, timestamp }: Props) {
  return (
    <Html>
      <Layout>
        <Container>
          <Heading as="h2">Payment received notification</Heading>
          <Text>The Alumni has marked the following job as payment-sent. Please credit each Active's dues balance in the chapter books.</Text>

          <Section>
            <Text><strong>Job:</strong> {jobDescription}</Text>
            <Text><strong>Job ID:</strong> {jobId}</Text>
            <Text><strong>Total received:</strong> ${totalAmount}</Text>
            <Text><strong>Timestamp:</strong> {timestamp.toISOString()}</Text>
          </Section>

          <Hr />

          <Heading as="h3">Credit each Active by:</Heading>
          <Section>
            {lineItems.map((item) => (
              <Row key={item.displayName}>
                <Column>{item.displayName}</Column>
                <Column align="right">${item.amount}</Column>
              </Row>
            ))}
            <Hr />
            <Row>
              <Column><strong>Total</strong></Column>
              <Column align="right"><strong>${totalAmount}</strong></Column>
            </Row>
          </Section>

          <Text>Sent by TODOs for Dues. For questions, contact the posting Alumni or your chapter Admin.</Text>
        </Container>
      </Layout>
    </Html>
  );
}
```

#### `packages/notifications/templates/AdminDispute.tsx`

```tsx
import { Html, Body, Container, Heading, Text, Section, Link } from '@react-email/components';
import { Layout } from './_components/Layout';

interface Props {
  jobDescription: string;
  jobId: string;
  disputerDisplayName: string;
  disputerRole: string;
  reason: string;
  adminViewUrl: string;
}

export function AdminDispute({ jobDescription, jobId, disputerDisplayName, disputerRole, reason, adminViewUrl }: Props) {
  return (
    <Html>
      <Layout>
        <Container>
          <Heading as="h2">Dispute opened — Admin attention needed</Heading>

          <Section>
            <Text><strong>Job:</strong> {jobDescription}</Text>
            <Text><strong>Job ID:</strong> {jobId}</Text>
            <Text><strong>Disputed by:</strong> {disputerDisplayName} ({disputerRole})</Text>
          </Section>

          <Section>
            <Heading as="h3">Reason</Heading>
            <Text>{reason}</Text>
          </Section>

          <Section>
            <Link href={adminViewUrl}>Open in Admin view →</Link>
          </Section>
        </Container>
      </Layout>
    </Html>
  );
}
```

`ModeratorNewPosting.tsx` and `AlumniRejection.tsx` follow the same shape — small templates with job details + a CTA link.

### 4.7 `apps/web/app/api/webhooks/resend/route.ts` — bounce/complaint webhook

```ts
import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';

export async function POST(req: NextRequest) {
  const signature = (await headers()).get('resend-signature');
  if (!signature || !verifyResendSignature(await req.text(), signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  const event = await req.json();
  switch (event.type) {
    case 'email.bounced':
    case 'email.complained':
      // Log + (optionally) update a suppressions table
      console.warn(`[email:bounce] type=${event.type} to=${event.data.to[0]}`);
      // For MVP: log only. No suppressions table; recipient addresses are chapter-controlled
      // and bounces should be rare. Revisit if bounce volume becomes a real signal.
      break;
    default:
      // Other events (delivered, opened, clicked) — ignore for MVP
      break;
  }
  return NextResponse.json({ ok: true });
}

function verifyResendSignature(body: string, signature: string): boolean {
  // HMAC verification per Resend's webhook signing — implementation per Resend docs
  return true; // sketch
}
```

## 5. Migration / data shape

N/A — no schema changes.

If we later add a `suppressions` table (per §4.7's deferred call), DESIGN-001 gets an addendum migration.

## 6. API contracts

### 6.1 Internal helpers (called from DESIGN-002 `afterCommit`)

| Helper | Triggered by | Input |
|--------|--------------|-------|
| `sendTreasurerEmail({ jobId })` | `transitionJob({ event: 'payment_sent' })` afterCommit | `{ jobId }` |
| `sendAdminDisputeEmail({ jobId, disputerId, reason })` | `transitionJob({ event: 'dispute' })` afterCommit | `{ jobId, disputerId, reason }` |
| `sendModeratorQueueEmail({ jobId })` | `createJob()` afterCommit (proposed addition) | `{ jobId }` |
| `sendAlumniRejectionEmail({ jobId, reason })` | `transitionJob({ event: 'reject' })` afterCommit (optional MVP) | `{ jobId, reason }` |

### 6.2 Webhook endpoint

`POST /api/webhooks/resend` — Resend signed-webhook receiver. Returns `{ ok: true }` for valid events; 401 for invalid signatures.

## 7. Error handling

| Source | Outcome | Surface |
|--------|---------|---------|
| `RESEND_API_KEY` missing (dev/test) | adapter logs + returns `{ skipped: true }` | dev console |
| Resend API error (5xx, network) | adapter throws | DESIGN-002 `afterCommit` swallows + logs (per Q-DSG-02 in DESIGN-002); transition stays committed |
| Recipient address missing from `chapter_settings` | helper throws | log + dev console; production alert (TBD with observability stack) |
| React Email render error | adapter throws | log + bug surface |
| Webhook signature invalid | 401 | request rejected |

> **Per DESIGN-002 `afterCommit` semantics:** any failure in this adapter is logged but does NOT fail the state transition. The treasurer email failing means the treasurer doesn't get the breakdown — the Alumni can re-trigger via Admin support out-of-band. Out-of-band is acceptable for MVP; outbox-and-retry is post-MVP per BCC-02 Q-CTX-03.

## 8. Testing approach

- **Unit tests** in `packages/notifications/__tests__/`:
  - Each helper's input → render path is correct (snapshot the React Email output)
  - Adapter `sendEmail` correctly skips when `RESEND_API_KEY` is missing
  - Adapter passes idempotency key when provided
- **Integration tests**: with a mocked Resend client, verify each helper composes the right `to` + `subject` + template input from a real DB-backed job + chapter_settings row
- **Webhook signature verification** unit test
- **E2E**: full flow — Alumni triggers payment-sent → integration test asserts a `Resend.send()` call with the expected arguments

## 9. Open questions

| ID | Question | Owner | Needed by |
|----|----------|-------|-----------|
| Q-DSG-01 | Should we add a `suppressions` table now (proactive) or defer until bounces become a real signal? Lean: **defer** — chapter-controlled recipients should bounce-rate near zero. Resend's dashboard is sufficient for MVP visibility. | Design | Post-MVP |
| Q-DSG-02 | ~~PRD-002 doesn't include a moderator-queue notification R-NN.~~ **Resolved 2026-05-14: PRD-002 R-12 added** ("When an Alumni submits a valid posting, the system shall send an email via Resend to the chapter's configured moderators-recipient address"). Plus PRD-007 R-07 + DESIGN-003 §4.6 + PLAN-007 updated to include `moderators_recipient_email` setting. | Product | ✅ Resolved 2026-05-14 |
| Q-DSG-03 | Moderator notification recipient: per-Moderator email vs. a single "moderators_recipient_email" chapter setting? Lean: **single chapter setting** for MVP (consistent with admin/treasurer pattern); per-Moderator preferences post-MVP. | Design | Pre-implementation |
| Q-DSG-04 | Should `sendModeratorQueueEmail` batch (one per N postings or per N minutes) or fire one per posting? Lean: **one per posting** (consistent with PRD-006 R-07 dispute pattern). MVP volume is low enough that batching is premature. | Design | Pre-implementation |

## 10. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. Realises ADR-005. Typed `sendEmail()` adapter wrapping Resend with React Email rendering + idempotency-key support + dev/test skip mode. Four template helpers (treasurer, admin dispute, moderator queue, Alumni rejection). Bounce/complaint webhook receiver (log-only for MVP). 4 design follow-up questions including a flagged PRD-002 gap (moderator-queue R-NN missing). |
| 2026-05-14 | Tom Haynes | §1 stale wording fixed: PRD-002 moderator notification is now R-12 (added 2026-05-14), no longer "we should add it." §4.4 promoted from TODO sketch to full implementation mirroring `sendAdminDisputeEmail()` — reads `moderators_recipient_email` (ADR-010, post-decision-outcome-expansion), invoked from `createJob()`'s `afterCommit` hook (DESIGN-002 §4.1.3), one email per posting per Q-DSG-04. |
