---
id: ADR-005
title: Use Resend with React Email for transactional email
status: Proposed
date: 2026-05-06
deciders: [Tom Haynes]
consulted: []
informed: []
related:
  prds: [PRD-001]
  adrs: [ADR-001, ADR-002]      # web framework (templates), auth (verification + reset + bootstrap)
  flows: []
  designs: []                   # docs/design/email.md pending
  supersedes: null
  superseded_by: null
---

## Context and problem statement

Several flows defined elsewhere require email: account-verification email and password-reset link (ADR-002), the bootstrap-admin "set your password" link (ADR-002), and post-MVP transactional notifications (job claimed, moderator approved a posting, payment marked sent or received). All are transactional. We need a provider and template story before the walking skeleton ships, because every flow short of inline UX depends on email working.

This ADR does **not** cover marketing email, bulk announcements, or member-to-member email forwarding (none in scope). It also does not finalize the sending domain strategy (shared `todofordues.com` vs. per-organization subdomain) — captured here as a deferred consideration.

## Decision drivers

1. **Reliable transactional delivery.** Verification and password reset are blocking-flow emails; a delivery miss is a user-visible failure.
2. **TypeScript / Next.js DX.** The API and template story should compose with ADR-001's stack with no impedance mismatch.
3. **Reasonable cost at MVP and chapter-scale.** Many small instances, modest per-instance volume — pricing must not punish breadth.
4. **Modest operational footprint.** No running an SMTP server, managing suppression lists by hand, or warming up IPs.
5. **Webhooks for delivery / bounce / complaint** events so we can record state, suppress further sends to bad addresses, and surface failures.
6. **Path to per-organization sending domain** later, if deliverability isolation becomes a concern.

## Considered options

- **Option A** — Resend + React Email
- **Option B** — Postmark with templates rendered from React Email or MJML
- **Option C** — AWS SES (direct via SDK) with custom template rendering
- **Option D** — SendGrid / Mailgun
- **Option E** — Self-hosted (Postal / Mailcow / Postfix)

## Decision outcome

**Chosen option:** **Option A — Resend + React Email**.

Resend's API is HTTP-first and TypeScript-typed, with first-party React Email integration — templates are JSX components, type-checked, agent-editable, and rendered to HTML by Resend's client. The service runs on AWS SES under the hood with managed reputation, so we inherit SES's deliverability without operating SES ourselves. Pricing is generous at MVP volume (free tier covers expected 100–2,000 emails/month for the launch chapter) and predictable through scale ($20/month at 50k emails). Webhooks land at a Next.js Route Handler (consistent with ADR-003 conventions) and persist delivery, bounce, and complaint events alongside our own records.

Postmark is the credible boring alternative — we'd pick it if Resend ever hits a stability or pricing regression, and switching is bounded because React Email's HTML output is provider-agnostic. SES direct is cheapest at scale but at the cost of DX and ops we'd have to absorb. SendGrid/Mailgun are older with no clear wins for our shape. Self-hosted email is rejected on deliverability grounds.

### Consequences

- **C-01 (good)** — JSX templates in TypeScript; agents author and modify them as normal source files. Variables and conditional rendering are type-checked.
- **C-02 (good)** — Generous free tier covers MVP; cost predictable through scale; chapter expansion does not punish us.
- **C-03 (good)** — Resend webhooks → Next.js Route Handler → DB record of delivery state. Useful for debugging "did the email actually arrive."
- **C-04 (good)** — Switching to Postmark or SES later is bounded: change the provider client; keep React Email rendering. Templates produce HTML that any provider accepts.
- **C-05 (bad)** — Resend is younger than Postmark or SES; smaller incident history; an outage has no in-cluster fallback in MVP. Mitigation: monitor the webhook event stream and surface delivery failures to the affected user with a "resend" affordance.
- **C-06 (bad)** — React Email's compatibility across email clients (Outlook desktop in particular) is solid but not perfect; some hand-tuning expected for edge clients.
- **C-07 (bad)** — Per-instance Resend API keys mean key management grows with chapter count. Not heavy, but not free.
- **C-08 (neutral)** — Sending-domain strategy (shared `todofordues.com` vs. per-org subdomain) is deferred. It affects deliverability isolation if one chapter ever has a complaint problem; for MVP a shared domain is fine.

### Confirmation

- All transactional email goes through Resend; no direct SES, SMTP, or other provider in app code.
- Templates live in `packages/emails/` (or equivalent monorepo location) as React Email components.
- Bounce/complaint webhook handler records events in an `email_events` table. Sends to addresses with hard bounces or complaints are suppressed by application logic.
- Integration test renders each template, snapshots the HTML, and asserts it parses with all expected variables substituted.
- Deploy smoke test sends one email to a known-good inbox and verifies the webhook records `delivered`.

## Pros and cons of the options

### Option A — Resend + React Email

Modern transactional ESP with first-party React Email integration; built on AWS SES.

- Good — Best-in-class TS/Next DX.
- Good — First-party React Email integration; templates are JSX.
- Good — Built on SES with managed reputation.
- Good — Free tier covers MVP; Pro tier ($20/month) covers low-thousands chapter scale.
- Good — Webhooks for delivery / bounce / complaint events.
- Bad — Younger company; less incident history.
- Bad — Email-client edge cases need careful template testing (true of any provider, slightly more so when leaning on a newer rendering pipeline).

### Option B — Postmark

Veteran transactional ESP with strong deliverability reputation.

- Good — Long, clean deliverability track record; "boring" reliability.
- Good — Separate transactional and broadcast streams (good hygiene).
- Good — Mature webhook system.
- Bad — Higher MVP cost ($15/month for 10k emails) — modest, but not free at MVP volume.
- Bad — React Email isn't first-party; we render JSX to HTML and post via HTTP. Workable, not seamless.
- Bad — DX is good but not as TS-native as Resend.

### Option C — AWS SES (direct)

Native AWS service; cheapest per email; full control.

- Good — Cheapest at scale (~$0.10 per 1,000 emails).
- Good — Direct AWS SDK integration.
- Bad — Requires sandbox-exit request, domain verification, and DIY suppression-list management.
- Bad — No first-party template story; we'd render JSX and post raw.
- Bad — Reputation is on us; IP warm-up required.

### Option D — SendGrid / Mailgun

Established mid-tier transactional providers.

- Good — Mature; large deliverability ops behind them.
- Bad — Older APIs; less TS-native than Resend.
- Bad — Mid-tier pricing without a clear advantage over Resend or Postmark for our shape.
- Bad — SendGrid's recent incident history (Twilio acquisition era) is mixed.

### Option E — Self-hosted (Postal / Mailcow / Postfix)

Run our own SMTP infrastructure.

- Bad — Deliverability nightmare without dedicated reputation work.
- Bad — Operational overhead (SMTP daemon, IP warm-up, blocklist management, DKIM key rotation).
- Rejected without further analysis.

## More information

### Templates we'll need (informative — final list in `docs/design/email.md`, pending)

- Account verification (post-signup)
- Password reset
- Bootstrap-admin "set your password" link
- (Post-MVP) Job claimed (notify Alumni)
- (Post-MVP) Job approved by moderator
- (Post-MVP) Payment marked sent (notify Active)
- (Post-MVP) Payment marked received (notify Alumni)

### Sending domain strategy (deferred)

Two paths, decision deferred until first chapter onboards:

- **Shared domain** — all instances send from `noreply@todofordues.com` (or a similar product-owned domain). Simpler; one DNS setup. Risk: a complaint from one chapter affects deliverability for all.
- **Per-organization subdomain** — each instance sends from `noreply@<chapter>.todofordues.com`. Better reputation isolation. Adds DNS / SPF / DKIM / DMARC setup per onboarded chapter.

For MVP a shared domain is acceptable; revisit if multi-chapter rollout exposes deliverability concerns.

### Future work this ADR implies

- Suppression-list table + handler (design doc).
- Template authoring conventions (variable naming, layout shell, dark-mode behavior) — design doc.
- If MVP volume exceeds Resend's Pro pricing comfort, evaluate SES direct.
- If member-to-member messaging ever needs email forwarding (probably never — see ADR-003 / PRD-001 R-06), that's a different ADR.

### Links

- Resend: <https://resend.com/>
- React Email: <https://react.email/>
- Postmark: <https://postmarkapp.com/>
- AWS SES: <https://aws.amazon.com/ses/>

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-06 | Tom Haynes | Initial draft. |
