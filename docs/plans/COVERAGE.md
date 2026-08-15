# Coverage matrix — MVP (REL-001)

Maps every PRD-002..008 R-NN + AC-NN, every DESIGN-001..006 §4 subsection, and every BCC-02 §7.1 CMD-NN to the implementation plan that builds it and the validation plan that proves it.

**Conventions:**
- "Plan" column = the implementation plan that produces the artifact.
- "Validation" column = the paired `*-validation.md` plan that tests it.
- "Deferred — REL-NNN" entries are out of MVP with the target release noted.
- This file is regenerated when plans are added or rescoped; not edited as a one-off.

> **Reading the matrix end-to-end:** if every cell has a non-empty "Plan" + "Validation" entry and no `Deferred` rows leak into the MVP path, MVP is plan-covered. The post-decomposition state below has zero gaps in the MVP path.

---

## 1. PRD R-NN + AC-NN coverage

### PRD-002 — Job posting & moderation

| PRD ref | Plan | Validation |
|---|---|---|
| R-01 (posting form fields) | PLAN-005 `jobs.post` + PLAN-006 `PostJobForm` | VALIDATION-005 + VALIDATION-006 |
| R-02 (positive dues) | PLAN-002 (DB CHECK) + PLAN-005 (Zod) | VALIDATION-002 + VALIDATION-005 |
| R-03 (non-empty description) | PLAN-002 (DB CHECK) + PLAN-005 (Zod) | same |
| R-04 (recommended count ≥ 1) | PLAN-002 (DB CHECK) + PLAN-005 (Zod) | same |
| R-05 (PostJob creates row + audit) | PLAN-003 `createJob` + PLAN-005 `jobs.post` | VALIDATION-003 + VALIDATION-005 |
| R-06 (moderation queue, oldest-first) | PLAN-005 `jobs.listModerationQueue` + PLAN-006 `/moderation-queue` | VALIDATION-005 + VALIDATION-006 |
| R-07 (approve transitions to approved) | PLAN-003 `approveJob` + PLAN-005 `jobs.approve` + PLAN-006 `ApproveRejectButtons` | VALIDATION-003 + VALIDATION-005 + VALIDATION-006 |
| R-08 (reject with reason) | PLAN-005 `jobs.reject` + PLAN-010 `ApproveRejectButtons` (reject) | VALIDATION-005 + VALIDATION-010 |
| R-09 (rejection reason displayed) | PLAN-010 `RejectedJobBanner` | VALIDATION-010 |
| R-10 (rejected terminal) | PLAN-003 `JOB_TRANSITIONS` map | VALIDATION-003 |
| R-11 (my-postings list) | PLAN-005 `jobs.listMyPosted` + PLAN-010 `/my-postings` | VALIDATION-005 + VALIDATION-010 |
| R-12 (moderator-queue email on post) | PLAN-007 `sendModeratorQueueEmail` (via `createJob.afterCommit` from PLAN-003) | VALIDATION-007 |
| AC-01 (post happy path) | PLAN-003 + PLAN-005 + PLAN-006 | VALIDATION-005 + VALIDATION-006 |
| AC-02..AC-05 (validation rejections) | PLAN-002 + PLAN-005 | VALIDATION-002 + VALIDATION-005 |
| AC-06 (queue ordering) | PLAN-005 + PLAN-006 | VALIDATION-005 + VALIDATION-006 |
| AC-07 (queue access control) | PLAN-005 (moderatorProcedure) | VALIDATION-005 |
| AC-08 (approve transition + audit) | PLAN-003 + PLAN-005 | VALIDATION-003 + VALIDATION-005 |
| AC-09 (self-approval permitted) | PLAN-005 | VALIDATION-005 |
| AC-10 (reject with reason) | PLAN-005 + PLAN-010 | VALIDATION-005 + VALIDATION-010 |
| AC-11 (empty reason rejected) | PLAN-005 (Zod) + PLAN-010 (client disable) | same |
| AC-12 (rejection reason visible) | PLAN-010 | VALIDATION-010 |
| AC-13 (rejected terminal) | PLAN-003 | VALIDATION-003 |
| AC-14 (my-postings ordering) | PLAN-010 | VALIDATION-010 |

### PRD-003 — Identity & Access

| PRD ref | Plan | Validation |
|---|---|---|
| R-01..R-10 (all) | PLAN-004 + PLAN-002 (DB) | VALIDATION-004 + VALIDATION-002 |
| R-11 (mint invite token) | PLAN-014 `invites.mint` | VALIDATION-014 |
| R-12 (list outstanding invites) | PLAN-014 `invites.list` + `/admin/invites` | VALIDATION-014 |
| R-13 (revoke invite token) | PLAN-014 `invites.revoke` | VALIDATION-014 |
| R-14 (single-use redemption) | PLAN-014 (signup-action fix) | VALIDATION-014 |
| AC-01..AC-09 (all) | PLAN-004 | VALIDATION-004 |
| AC-10..AC-13 (invite management) | PLAN-014 | VALIDATION-014 |

### PRD-004 — Enrollment, lock & reschedule

| PRD ref | Plan | Validation |
|---|---|---|
| R-01 (auto enrollment_open) | PLAN-003 `approveJob` (two-row pattern) | VALIDATION-003 |
| R-02 (enroll) | PLAN-003 `recordRelationshipEvent` + PLAN-005 `jobs.enroll` + PLAN-006 `EnrollButton` | VALIDATION-003 + VALIDATION-005 + VALIDATION-006 |
| R-03 (unenroll) | PLAN-003 + PLAN-005 `jobs.unenroll` + PLAN-010 `UnenrollButton` | VALIDATION-003 + VALIDATION-005 + VALIDATION-010 |
| R-04 (unenroll only from enrollment_open) | PLAN-005 (guard) | VALIDATION-005 |
| R-05 (roster visibility role-projection) | PLAN-005 `jobs.getById` + PLAN-006/010 `JobDetailView` | VALIDATION-005 + VALIDATION-006 + VALIDATION-010 |
| R-06 (my-enrollments) | PLAN-005 `jobs.listMyEnrolled` + PLAN-010 `/my-enrollments` | VALIDATION-005 + VALIDATION-010 |
| R-07 (lock with date) | PLAN-005 `jobs.lock` + PLAN-006 `LockJobForm` | VALIDATION-005 + VALIDATION-006 |
| R-08 (lock past date rejected) | PLAN-005 | VALIDATION-005 |
| R-09 (lock with zero enrollees rejected) | PLAN-005 | VALIDATION-005 |
| R-10 (reschedule) | PLAN-005 `jobs.reschedule` + PLAN-010 `RescheduleButton` | VALIDATION-005 + VALIDATION-010 |
| R-11 (cancel with reason) | PLAN-005 `jobs.cancel` + PLAN-010 `CancelJobModal` | VALIDATION-005 + VALIDATION-010 |
| R-12 (cancelled terminal) | PLAN-003 | VALIDATION-003 |
| AC-01..AC-03 (auto enrollment_open + enroll + idempotency) | PLAN-003 + PLAN-005 | VALIDATION-003 + VALIDATION-005 |
| AC-04..AC-05 (unenroll happy + lock-blocked) | PLAN-005 + PLAN-010 | VALIDATION-005 + VALIDATION-010 |
| AC-06..AC-07 (roster visibility tiers) | PLAN-005 + PLAN-010 | same |
| AC-08..AC-11 (lock happy, only-poster, past date, zero roster) | PLAN-005 + PLAN-006 | VALIDATION-005 + VALIDATION-006 |
| AC-12 (reschedule preserves roster) | PLAN-005 + PLAN-010 | VALIDATION-005 + VALIDATION-010 |
| AC-13..AC-14 (cancel happy + empty reason) | PLAN-005 + PLAN-010 | same |
| AC-15 (cancelled terminal) | PLAN-003 | VALIDATION-003 |

### PRD-005 — Completion & payment-sent

| PRD ref | Plan | Validation |
|---|---|---|
| R-01 (CompleteJob persists attendees + audit) | PLAN-005 `jobs.complete` + PLAN-006 `CompleteJobForm` | VALIDATION-005 + VALIDATION-006 |
| R-02 (zero attendees rejected) | PLAN-005 (Zod) | VALIDATION-005 |
| R-03 (non-enrolled rejected) | PLAN-005 | VALIDATION-005 |
| R-04 (per-Active credit map) | PLAN-005 `computeDuesSplit` | VALIDATION-005 |
| R-05 (revert from completed) | PLAN-005 `jobs.revertCompletion` + PLAN-010 `RevertCompletionButton` | VALIDATION-005 + VALIDATION-010 |
| R-06 (MarkPaymentSent fires email) | PLAN-005 + PLAN-007 | VALIDATION-005 + VALIDATION-007 |
| R-07 (treasurer email shape) | PLAN-007 `sendTreasurerEmail` + `TreasurerBreakdown` template | VALIDATION-007 |
| R-08 (no revert from payment_sent) | PLAN-003 (FSM map) | VALIDATION-003 |
| R-09 (only poster can complete/revert/markPaymentSent) | PLAN-005 (`jobPosterProcedure`) | VALIDATION-005 |
| AC-01..AC-05 (complete + rounding) | PLAN-005 + PLAN-006 | VALIDATION-005 + VALIDATION-006 |
| AC-06 (revert) | PLAN-005 + PLAN-010 | VALIDATION-005 + VALIDATION-010 |
| AC-07 (markPaymentSent + email) | PLAN-005 + PLAN-006 + PLAN-007 | VALIDATION-005 + VALIDATION-006 + VALIDATION-007 |
| AC-08 (email content shape) | PLAN-007 | VALIDATION-007 |
| AC-09 (no revert from payment_sent) | PLAN-003 | VALIDATION-003 |
| AC-10 (non-poster → FORBIDDEN) | PLAN-005 | VALIDATION-005 |

### PRD-006 — Loop closure & dispute

| PRD ref | Plan | Validation |
|---|---|---|
| R-01 (Active confirms receipt) | PLAN-005 `jobs.confirmReceipt` + PLAN-006 `ConfirmReceivedButton` | VALIDATION-005 + VALIDATION-006 |
| R-02 (Admin confirms receipt) | PLAN-005 | VALIDATION-005 |
| R-03 (non-enrolled non-Admin → FORBIDDEN) | PLAN-005 (auth) | VALIDATION-005 |
| R-04 (race: first-write-wins) | PLAN-005 (`alreadyClosed` idempotent response) + PLAN-010 (UI toast) | VALIDATION-005 + VALIDATION-010 |
| R-05 (Active disputes with reason) | PLAN-005 `jobs.dispute` + PLAN-010 `DisputeJobModal` | VALIDATION-005 + VALIDATION-010 |
| R-06 (Admin disputes) | PLAN-005 + PLAN-011 (Admin can also dispute via /admin/jobs/[id]'s JobDetailView) | VALIDATION-005 + VALIDATION-011 |
| R-07 (admin-recipient email) | PLAN-007 `sendAdminDisputeEmail` | VALIDATION-007 |
| R-08 (resolve_closed with note) | PLAN-005 `jobs.resolveDisputeAsClosed` + PLAN-011 `ResolveDisputeModal` | VALIDATION-005 + VALIDATION-011 |
| R-09 (resolve_cancelled) | same family | same |
| R-10 (resolve_payment_sent — false alarm) | same family | same |
| R-11 (closed/cancelled-from-disputed terminal) | PLAN-003 | VALIDATION-003 |
| R-12 (non-Admin resolve → FORBIDDEN) | PLAN-005 (`adminProcedure`) | VALIDATION-005 |
| AC-01..AC-04 (receipt happy + Admin + 403 + race) | PLAN-005 + PLAN-006 + PLAN-010 | VALIDATION-005 + VALIDATION-006 + VALIDATION-010 |
| AC-05..AC-07 (dispute + reason validation + email) | PLAN-005 + PLAN-007 + PLAN-010 | VALIDATION-005 + VALIDATION-007 + VALIDATION-010 |
| AC-08..AC-11 (Admin resolve variants) | PLAN-005 + PLAN-011 | VALIDATION-005 + VALIDATION-011 |
| AC-12 (closed/cancelled terminal) | PLAN-003 | VALIDATION-003 |
| AC-13 (non-Admin resolve → 403) | PLAN-005 | VALIDATION-005 |

### PRD-007 — Admin view & audit log

| PRD ref | Plan | Validation |
|---|---|---|
| R-01 (/admin route Admin-only) | PLAN-011 `/admin/layout.tsx` | VALIDATION-011 |
| R-02 (Dashboard aggregate counts) | PLAN-005 `admin.getAggregateCounts` + PLAN-011 `AggregateCountsCards` | VALIDATION-005 + VALIDATION-011 |
| R-03 (drill-in from card) | PLAN-011 (state query param) | VALIDATION-011 |
| R-04 (Disputes list) | PLAN-005 `admin.listDisputed` + PLAN-011 `DisputeCardList` | VALIDATION-005 + VALIDATION-011 |
| R-05 (Disputes inline resolve actions) | PLAN-011 `ResolveDisputeModal` | VALIDATION-011 |
| R-06 (per-job audit log) | PLAN-005 `jobs.getHistory` + PLAN-011 `AuditLogTable` | VALIDATION-005 + VALIDATION-011 |
| R-07 (Settings 5 keys) | PLAN-002 (chapter_settings + bootstrap) + PLAN-005 `settings.list/.set` + PLAN-011 `SettingsForm` | VALIDATION-002 + VALIDATION-005 + VALIDATION-011 |
| R-08 (per-field save-on-blur + validation) | PLAN-005 (Zod) + PLAN-011 `SettingsForm` | VALIDATION-005 + VALIDATION-011 |
| R-09 (atomic state + audit-log write) | PLAN-003 `transitionJob` | VALIDATION-003 |
| R-10 (Users sub-route hosts PRD-008 components) | PLAN-011 (shell) + PLAN-012 (real components) | VALIDATION-011 + VALIDATION-012 |
| AC-01..AC-04 (layout + dashboard + drill-in) | PLAN-011 | VALIDATION-011 |
| AC-05..AC-06 (disputes list + resolve modal) | PLAN-011 | VALIDATION-011 |
| AC-07 (audit log timeline) | PLAN-011 | VALIDATION-011 |
| AC-08..AC-09 (settings save + invalid) | PLAN-011 | VALIDATION-011 |
| AC-10 (transition atomicity) | PLAN-003 | VALIDATION-003 |
| AC-11 (Users sub-route renders PLAN-012 components) | PLAN-012 | VALIDATION-012 |

### PRD-008 — Role management

| PRD ref | Plan | Validation |
|---|---|---|
| R-01 (self-role-change non-privileged) | PLAN-003 `transitionRole` + PLAN-005 `users.changeRole` + PLAN-012 `RoleChangeDropdown` | VALIDATION-003 + VALIDATION-005 + VALIDATION-012 |
| R-02 (Admin grants privileged) | PLAN-005 `users.grantRole` + PLAN-012 `UserListTable` | VALIDATION-005 + VALIDATION-012 |
| R-03 (Admin demotes privileged) | same | same |
| R-04 (no self-elevation to privileged) | PLAN-005 (Zod enum restriction) + PLAN-012 (dropdown filter) | VALIDATION-005 + VALIDATION-012 |
| R-05 (min-Admin enforced at DB + 422 mapping) | PLAN-002 (trigger) + PLAN-003 (`MinAdminInvariantError`) + PLAN-005 (422 response) | VALIDATION-002 + VALIDATION-003 + VALIDATION-005 |
| R-06 (UI shows error + contextual link) | PLAN-012 `MinAdminErrorBanner` | VALIDATION-012 |
| R-07 (`user_role_transitions` shape) | PLAN-002 (schema) + PLAN-003 (writer) | VALIDATION-002 + VALIDATION-003 |
| R-08 (Admin Users list) | PLAN-005 `users.list` + PLAN-012 `UserListTable` | VALIDATION-005 + VALIDATION-012 |
| R-09 (profile self-service dropdown filtered) | PLAN-012 `RoleChangeDropdown` + `/profile` | VALIDATION-012 |
| R-10 (per-user role history) | PLAN-005 `users.getRoleHistory` + PLAN-012 `RoleChangeHistoryTable` | VALIDATION-005 + VALIDATION-012 |
| AC-01..AC-02 (self-service + Admin grant) | PLAN-005 + PLAN-012 | VALIDATION-005 + VALIDATION-012 |
| AC-03 (no self-grant to Admin) | PLAN-005 + PLAN-012 | same |
| AC-04 (last-Admin demotion blocked at DB) | PLAN-002 + PLAN-003 | VALIDATION-002 + VALIDATION-003 |
| AC-05 (atomic swap) | PLAN-002 + PLAN-003 + PLAN-012 (UI flow) | VALIDATION-002 + VALIDATION-003 + VALIDATION-012 |
| AC-06 (banner + contextual link) | PLAN-012 | VALIDATION-012 |
| AC-07 (every change writes audit row) | PLAN-003 | VALIDATION-003 |
| AC-08 (Users list renders) | PLAN-012 | VALIDATION-012 |
| AC-09..AC-10 (dropdown filtering per role) | PLAN-012 | VALIDATION-012 |
| AC-11 (role history rendering) | PLAN-012 | VALIDATION-012 |

---

## 2. DESIGN §4.* subsection coverage

| DESIGN-§ | Plan | Validation |
|---|---|---|
| DESIGN-001 §4.1 enums | PLAN-002 | VALIDATION-002 |
| DESIGN-001 §4.2 users | PLAN-002 | VALIDATION-002 |
| DESIGN-001 §4.3 invite_tokens | PLAN-002 | VALIDATION-002 |
| DESIGN-001 §4.4 jobs | PLAN-002 | VALIDATION-002 |
| DESIGN-001 §4.5 job_enrollments | PLAN-002 | VALIDATION-002 |
| DESIGN-001 §4.6 job_state_transitions | PLAN-002 | VALIDATION-002 |
| DESIGN-001 §4.7 user_role_transitions | PLAN-002 | VALIDATION-002 |
| DESIGN-001 §4.8 chapter_settings | PLAN-002 | VALIDATION-002 |
| DESIGN-001 §5.3 min-Admin trigger | PLAN-002 (hand-written migration) | VALIDATION-002 |
| DESIGN-001 §5.5 chapter_settings bootstrap | PLAN-002 (`0005_bootstrap_chapter_settings.sql`) | VALIDATION-002 |
| DESIGN-002 §4.1 JOB_TRANSITIONS map | PLAN-003 | VALIDATION-003 |
| DESIGN-002 §4.1.2 transitionJob | PLAN-003 | VALIDATION-003 |
| DESIGN-002 §4.1.3 createJob + approveJob (incl. `afterCommit`) | PLAN-003 (refined) | VALIDATION-003 |
| DESIGN-002 §4.1.4 per-transition hooks | PLAN-005 (wires them) | VALIDATION-005 |
| DESIGN-002 §4.1.5 recordRelationshipEvent | PLAN-003 (refined — single writer for enroll/unenroll audit rows) | VALIDATION-003 |
| DESIGN-002 §4.2 transitionRole | PLAN-003 | VALIDATION-003 |
| DESIGN-002 §4.3 errors module | PLAN-003 | VALIDATION-003 |
| DESIGN-003 §4.1 trpc context + factories | PLAN-005 | VALIDATION-005 |
| DESIGN-003 §4.2 role middleware | PLAN-005 | VALIDATION-005 |
| DESIGN-003 §4.3 job ownership middleware | PLAN-005 | VALIDATION-005 |
| DESIGN-003 §4.4 jobs router | PLAN-005 | VALIDATION-005 |
| DESIGN-003 §4.4.1 computeDuesSplit | PLAN-005 | VALIDATION-005 |
| DESIGN-003 §4.5 users router | PLAN-005 | VALIDATION-005 |
| DESIGN-003 §4.6 settings router | PLAN-005 | VALIDATION-005 |
| DESIGN-003 §4.7 admin router | PLAN-005 | VALIDATION-005 |
| DESIGN-003 §4.8 invites router | PLAN-005 | VALIDATION-005 |
| DESIGN-004 §4.1 Better Auth config | PLAN-004 | VALIDATION-004 |
| DESIGN-004 §4.2 HD-restriction hook | PLAN-004 | VALIDATION-004 |
| DESIGN-004 §4.3 session-extension hook | PLAN-004 | VALIDATION-004 |
| DESIGN-004 §4.4 bootstrap-admin hook | PLAN-004 | VALIDATION-004 |
| DESIGN-004 §4.5 verify-invite-token | PLAN-004 | VALIDATION-004 |
| DESIGN-004 §4.6/§4.7/§4.8 (3 Server Actions) | PLAN-004 | VALIDATION-004 |
| DESIGN-004 §4.9 account linking | PLAN-004 | VALIDATION-004 |
| DESIGN-004 §4.10 OAuth catch-all route | PLAN-004 | VALIDATION-004 |
| DESIGN-005 §4.1 sendEmail adapter | PLAN-007 | VALIDATION-007 |
| DESIGN-005 §4.2 treasurer helper | PLAN-007 | VALIDATION-007 |
| DESIGN-005 §4.3 admin-dispute helper | PLAN-007 | VALIDATION-007 |
| DESIGN-005 §4.4 moderator-new-posting helper | PLAN-007 | VALIDATION-007 |
| DESIGN-005 §4.5 alumni-rejection helper (optional MVP) | PLAN-007 | VALIDATION-007 |
| DESIGN-005 §4.6 React Email templates | PLAN-007 | VALIDATION-007 |
| DESIGN-005 §4.7 Resend webhook | PLAN-007 | VALIDATION-007 |
| DESIGN-006 §3 route tree (walking-skeleton subset) | PLAN-006 | VALIDATION-006 |
| DESIGN-006 §3 route tree (`/my-postings`, `/my-enrollments`) | PLAN-010 | VALIDATION-010 |
| DESIGN-006 §3 route tree (`/admin/*` excl. `/admin/users`) | PLAN-011 | VALIDATION-011 |
| DESIGN-006 §3 route tree (`/profile`, `/admin/users`, `/admin/users/[id]`) | PLAN-012 | VALIDATION-012 |
| DESIGN-006 §4.2 walking-skeleton component subset | PLAN-006 | VALIDATION-006 |
| DESIGN-006 §4.3 JobDetailView role-conditional | PLAN-006 (subset) + PLAN-010 (extends) | VALIDATION-006 + VALIDATION-010 |
| DESIGN-006 §4.3 PostJobForm | PLAN-006 | VALIDATION-006 |
| DESIGN-006 §4.3 MinAdminErrorBanner | PLAN-012 | VALIDATION-012 |
| DESIGN-006 §4.3 AggregateCountsCards | PLAN-011 | VALIDATION-011 |
| DESIGN-006 §4.4 Server Actions vs tRPC pattern | PLAN-004 + PLAN-005 | VALIDATION-004 + VALIDATION-005 |
| DESIGN-006 §4.5 loading / error / empty states | PLAN-006 + PLAN-010 + PLAN-011 + PLAN-012 (each per-page) | each plan's validation |
| DESIGN-006 §4.6 stateDisplayName formatter | PLAN-006 (`lib/formatters.ts`) | VALIDATION-006 |
| DESIGN-006 §4.7 chapter-local date formatter | PLAN-006 | VALIDATION-006 |
| DESIGN-006 §4.8 TippingNudge | PLAN-006 | VALIDATION-006 |

---

## 3. BCC-02 §7.1 CMD-NN coverage

All 16 commands per BCC-02 §7.1 (CMD-14 split a/b/c).

| CMD | Helper(s) | tRPC procedure | UI | Validation |
|---|---|---|---|---|
| CMD-01 PostJob | PLAN-003 `createJob` (with `afterCommit`) | PLAN-005 `jobs.post` | PLAN-006 `PostJobForm` | VALIDATION-003 + -005 + -006 |
| CMD-02 ApproveJob | PLAN-003 `approveJob` | PLAN-005 `jobs.approve` | PLAN-006 `ApproveRejectButtons` | VALIDATION-003 + -005 + -006 |
| CMD-03 RejectJob | PLAN-003 `transitionJob(reject)` | PLAN-005 `jobs.reject` | PLAN-010 `ApproveRejectButtons` (reject) | VALIDATION-003 + -005 + -010 |
| CMD-04 EnrollInJob | PLAN-003 `recordRelationshipEvent(enroll)` | PLAN-005 `jobs.enroll` | PLAN-006 `EnrollButton` | VALIDATION-003 + -005 + -006 |
| CMD-05 UnenrollFromJob | PLAN-003 `recordRelationshipEvent(unenroll)` | PLAN-005 `jobs.unenroll` | PLAN-010 `UnenrollButton` | VALIDATION-003 + -005 + -010 |
| CMD-06 LockJob | PLAN-003 `transitionJob(lock)` | PLAN-005 `jobs.lock` | PLAN-006 `LockJobForm` | VALIDATION-003 + -005 + -006 |
| CMD-07 RescheduleJob | PLAN-003 `transitionJob(reschedule)` | PLAN-005 `jobs.reschedule` | PLAN-010 `RescheduleButton` | VALIDATION-003 + -005 + -010 |
| CMD-08 CancelJob | PLAN-003 `transitionJob(cancel)` | PLAN-005 `jobs.cancel` | PLAN-010 `CancelJobModal` | VALIDATION-003 + -005 + -010 |
| CMD-09 CompleteJob | PLAN-003 `transitionJob(complete)` | PLAN-005 `jobs.complete` | PLAN-006 `CompleteJobForm` | VALIDATION-003 + -005 + -006 |
| CMD-10 RevertCompletion | PLAN-003 `transitionJob(revert)` | PLAN-005 `jobs.revertCompletion` | PLAN-010 `RevertCompletionButton` | VALIDATION-003 + -005 + -010 |
| CMD-11 MarkPaymentSent | PLAN-003 `transitionJob(payment_sent)` + PLAN-007 `sendTreasurerEmail` | PLAN-005 `jobs.markPaymentSent` | PLAN-006 `MarkPaymentSentButton` | VALIDATION-003 + -005 + -006 + -007 |
| CMD-12 ConfirmReceipt | PLAN-003 `transitionJob(confirm_receipt)` | PLAN-005 `jobs.confirmReceipt` (with idempotent race response) | PLAN-006 `ConfirmReceivedButton` + PLAN-010 (race toast) | VALIDATION-003 + -005 + -006 + -010 |
| CMD-13 DisputeJob | PLAN-003 `transitionJob(dispute)` + PLAN-007 `sendAdminDisputeEmail` | PLAN-005 `jobs.dispute` | PLAN-010 `DisputeJobModal` | VALIDATION-003 + -005 + -007 + -010 |
| CMD-14a ResolveDisputeAsClosed | PLAN-003 `transitionJob(resolve_closed)` | PLAN-005 `jobs.resolveDisputeAsClosed` | PLAN-011 `ResolveDisputeModal` | VALIDATION-003 + -005 + -011 |
| CMD-14b ResolveDisputeAsCancelled | PLAN-003 `transitionJob(resolve_cancelled)` | PLAN-005 `jobs.resolveDisputeAsCancelled` | PLAN-011 | same |
| CMD-14c ResolveDisputeAsPaymentSent | PLAN-003 `transitionJob(resolve_payment_sent)` | PLAN-005 `jobs.resolveDisputeAsPaymentSent` | PLAN-011 | same |

---

## 4. Deferred — out of REL-001 (MVP)

| Item | Reason | Target release |
|---|---|---|
| PRD-009 — Communication channel | Blocked on PRD-001 Q-07 (in-app DM vs phone reveal vs link-out) | REL-002 |
| ADC-02 ST-04 (DeactivateUser) | Out of MVP per PRD-003 Q-02; manual Admin action only | REL-002+ |
| Workspace SCIM auto-sync | Manual Admin deactivation suffices for MVP | REL-002+ |
| Per-Admin notification preferences | Single chapter-recipient is enough for one chapter | REL-002+ |
| Audit-log search by actor / note text | Find-by-job-ID covers MVP use case | REL-002+ |
| Audit-log retention cap / archival | Append-forever per ADR-009 — table volume negligible at MVP scale | REL-002+ |
| Aggregate-counts caching / materialized views | Live SQL fine for one chapter | REL-002+ |
| Bulk role grants / role expiration / scheduled demotion | YAGNI for one chapter | REL-002+ |
| Per-user last-active timestamp on Admin Users list | PRD-008 Q-03 lean defer | REL-002+ |
| Per-job availability poll before lock | DDD-002 H-01 — Alumni picks date based on roster + off-app coord | REL-002+ |
| Reschedule-count limit | Add if thrash becomes a real signal | REL-002+ |
| Notifications on reschedule/cancel | PRD-004 Q-03 lean defer | REL-002+ |
| Auto-close after N days in payment_sent | PRD-006 §7.1 non-goal; loop-stall reminders are post-MVP | REL-002+ |
| Per-Admin dispute assignment / queues | First-Admin-to-act suffices | REL-002+ |
| Outbox / retry for `afterCommit` failures | Log-only sufficient at MVP scale | REL-002+ |
| Suppressions table for bounce/complaint | Log-only for MVP; recipients are chapter-controlled | REL-002+ |
| Dashboard "longest-stalled job" stat | PRD-007 Q-05 lean low-cost — flagged but not in MVP plan | REL-002 (small follow-up plan) |
| Phase 1.2 public deploy (`*.haynesnetwork.com` + cloudflare-tunnel) | After Phase 1.1 internal stabilizes | post-REL-001 follow-up plan |
| `per_active_dues_credit` jsonb → join table promotion | ADC-01 Q-AGG-04 / DESIGN-001 Q-DSG-04 — design ambiguity; jsonb works for MVP | revisit pre-REL-002 |
| Per-job audit timeline cross-job search | PRD-007 Q-04 lean defer | REL-002+ |

---

### PRD-010 — Job content enrichment

| PRD ref | Plan | Validation |
|---|---|---|
| R-01 (form captures contact/location/duration) | PLAN-016 §3 Track B + C | VALIDATION-016 |
| R-02 (validation rejects missing/invalid values) | PLAN-016 §3 Track B + D | VALIDATION-016 |
| R-03 (detail view renders new fields) | PLAN-016 §3 Track C | VALIDATION-016 |
| R-04 (persistence + audit-log payload) | PLAN-016 §3 Track A + B | VALIDATION-016 |
| R-05 (`tel:`/`mailto:` rendering) | PLAN-016 §3 Track C | VALIDATION-016 |
| R-06 (privacy: account email not exposed) | PLAN-016 §3 Track C | VALIDATION-016 |
| R-07 (optional `additional_notes`) | PLAN-016 §3 Track A + B + C | VALIDATION-016 |
| AC-01..AC-07 | PLAN-016 §3 Track D | VALIDATION-016 |

### PRD-011 — Job editability before lock

| PRD ref | Plan | Validation |
|---|---|---|
| R-01..R-02 (Edit affordance + state gates) | PLAN-017 §3 Track D | VALIDATION-017 |
| R-03 (editable field whitelist) | PLAN-017 §3 Track C | VALIDATION-017 |
| R-04 (server-side state gate / typed error) | PLAN-017 §3 Track A + C | VALIDATION-017 |
| R-05 (material edit → re-moderation) | PLAN-017 §3 Track A | VALIDATION-017 |
| R-06 (cosmetic edit stays in state) | PLAN-017 §3 Track A | VALIDATION-017 |
| R-07 (`job_content_changes` audit row) | PLAN-017 §3 Track A + B | VALIDATION-017 |
| R-08 (`[Re-review]` moderator email) | PLAN-017 §3 Track E | VALIDATION-017 |
| R-09 (diff in moderation queue UI) | PLAN-017 §3 Track D [P1; may defer] | VALIDATION-017 |
| R-10 (per-Active edit notification email) | PLAN-017 §3 Track E | VALIDATION-017 |
| AC-01..AC-07 | PLAN-017 §3 Track F | VALIDATION-017 |
| ADR-008 addendum (new transitions) | PLAN-017 §3 Track A | VALIDATION-017 G-6 |

### PRD-012 — Real-time UI updates

| PRD ref | Plan | Validation |
|---|---|---|
| R-01 (publish events for every mutation) | PLAN-018 §3 Track C | VALIDATION-018 |
| R-02 (SSE endpoint + auth gate) | PLAN-018 §3 Track B | VALIDATION-018 |
| R-03 (30s keepalive) | PLAN-018 §3 Track B | VALIDATION-018 (§3 C-09) |
| R-04 (reconnect + Last-Event-ID replay) | PLAN-018 §3 Track A + B | VALIDATION-018 |
| R-05 (client invalidates + router.refresh on event) | PLAN-018 §3 Track D | VALIDATION-018 (§5 stale-page guard) |
| R-06 (graceful degradation if SSE blocked) | PLAN-018 §3 Track D | VALIDATION-018 |
| R-07 (privacy: IDs only in payload) | PLAN-018 §3 Track A + B | VALIDATION-018 (G-8) |
| R-08 (moderator new-arrival badge) | PLAN-018 §3 Track D [P1] | VALIDATION-018 |
| R-09 (capacity floor) | PLAN-018 §3 Track A | VALIDATION-018 (§3 C-01) |
| AC-01..AC-07 | PLAN-018 §3 Track E | VALIDATION-018 |
| ADR-012 C-01..C-10 | PLAN-018 §3 across tracks | VALIDATION-018 §3 |

## 5. Plan ordering DAG

```
PLAN-001 scaffolding
   └── PLAN-002 DB schema (+ chapter_settings bootstrap)
         └── PLAN-003 FSM module (+ recordRelationshipEvent + createJob.afterCommit)
               └── PLAN-004 Auth wiring
                     └── PLAN-005 tRPC procedures (all 5 routers)
                           ├── PLAN-006 Walking-skeleton UI
                           │     └── PLAN-007 Notifications
                           │           └── PLAN-008 Walking-skeleton E2E
                           │                 └── PLAN-009 Phase 1.1 internal deploy   [terminal in WS path]
                           │
                           ├── PLAN-010 MVP job-loop UI rest          [depends on PLAN-005/006/007]
                           ├── PLAN-011 Admin view UI                  [depends on PLAN-005/006/007]
                           │     └── PLAN-012 Role management UI       [depends on PLAN-011's /admin/users shell]
                           │
                           ├── PLAN-013 SDLC hardening (live deploy ops)  [shipped post-PLAN-014]
                           └── PLAN-014 Invite management UI + admin nav  [post-MVP-launch]

[Post-MVP / post-click-through fixes wave — feature work, sequential]
PLAN-016 Job content enrichment (PRD-010)
   └── PLAN-017 Job editability pre-lock (PRD-011)
         └── PLAN-018 Real-time UI updates (PRD-012 + ADR-012)
```

Each implementation plan is paired 1-to-1 with a `*-validation.md` sibling that runs after it.

---

## 6. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial coverage matrix from plan-decomposition pass. All MVP PRD R-NN/AC-NN, all DESIGN §4 subsections, and all BCC-02 CMD-NN have a plan + validation. Deferred items enumerated with REL-002+ target. Plan ordering DAG sane: every prerequisite resolves to an earlier plan. |
| 2026-05-20 | Coordinator | Post-MVP click-through. Added PRD-010 (job content enrichment) → PLAN-016, PRD-011 (job editability) → PLAN-017, PRD-012 (real-time UI) → PLAN-018 + ADR-012 (SSE transport). Plan ordering DAG extended: 016 → 017 → 018 (sequential — 017 depends on 016's new schema; 018 depends on 017's edit mutation as one of the events it broadcasts). |
| 2026-08-14 | Agent (coordinator-directed) | ADR-014 (portal member status consumption — sigo-alumni backlog item 07) landed as a cross-repo contract feature outside the PRD→PLAN pipeline, per coordinator direction. No PRD/PLAN IDs to add to the matrix; validation surface is enumerated in ADR-014 §Validation. PRD-008 R-01/R-09 self-service rows are unchanged — the profile control now fronts the portal registry when available and falls back to `users.changeRole` when not. |
| 2026-08-14 | Agent (owner-directed, backlog 07 ruling) | ADR-015 supersedes ADR-014 after the Sev-1 role-loss incident: member status is now FULLY ORTHOGONAL to roles. Role enum → Member\|Moderator\|Admin (Alumni→Member; migration 0012); the self-service `users.changeRole` and admin `users.grantRole` procedures + their UI are REMOVED (claim-sync is the sole role writer); access gating (post/claim) re-keyed from role to portal STATUS. PRD-008 R-01/R-04 (self-service step-down) and R-02/R-03 (admin grant) are RETIRED — roles are portal-derived only; validation surface enumerated in ADR-015 §Confirmation. |
