---
id: ADR-010
title: Use a hybrid env-var-plus-DB-table strategy for per-instance settings
status: Proposed
date: 2026-05-14
deciders: [Tom Haynes]
consulted: []
informed: []
related:
  prds: [PRD-001, PRD-005, PRD-006, PRD-007]
  adrs: [ADR-002, ADR-004, ADR-006, ADR-007]
  flows: []
  designs: []
  supersedes: null
  superseded_by: null
---

## Context and problem statement

PRD-001 R-14 introduces two configurable per-instance email recipients (Admin distro, Treasurer recipient) — both currently described as "either env var or Admin-editable in PRD-007's advanced settings, decided in design." PRD-007 R-13 (c) reserves space for an "advanced settings" section. ADR-007 (Workspace OIDC) already commits to env-var configuration for `OIDC_CLIENT_ID/SECRET/HOSTED_DOMAIN`. The decision: env-var-only, DB-backed only, or hybrid? And what's the rule for which goes where?

## Decision drivers

1. **Boot-time vs. runtime change cost.** Env vars require a redeploy to change. DB-backed settings change without a deploy.
2. **First-Admin chicken-and-egg.** Some settings must exist *before* any Admin can sign in (OIDC config), so they can't live in a DB-table that only an Admin can edit.
3. **Sensitivity.** Secrets (OAuth client secret, DB URL) belong in env vars + secret manager (1Password Connect via External Secrets Operator per `reference_external_systems.md`), not in plaintext DB columns.
4. **Discoverability for Admins.** Operational knobs Admins are expected to tune (recipient addresses, branding text someday) should be in the app UI — they shouldn't have to ask the operator to redeploy.
5. **Per-instance scope.** One chapter == one instance == one deployment. No cross-instance settings layer needed.
6. **Solo-dev minimal infra.** Avoid building a settings-management framework before we have settings to manage.

## Considered options

- **Option A** — Env-var only for everything. PRD-007's "advanced settings" section is empty for MVP.
- **Option B** — DB-backed only for everything (except DB URL itself, by necessity). Bootstrap settings via migration seeds.
- **Option C** — Hybrid: env vars for boot-time / sensitive / rarely-changed config; DB-backed key-value table for Admin-tunable operational settings.

## Decision outcome

**Chosen option:** *Option C — hybrid env-var + DB-backed key-value settings.*

**Env vars** for: OIDC config (client id/secret/hosted domain — pre-auth, must exist before any login), DB URL, Resend API key, `BOOTSTRAP_ADMIN_EMAIL` (per ADR-002, used for emergency Admin promotion), any deployment-target-specific URLs (cluster name, public domain). Delivered via External Secrets Operator from 1Password Connect.

**DB-backed `chapter_settings` table** for Admin-tunable operational settings:

```sql
CREATE TABLE chapter_settings (
  key          text        PRIMARY KEY,
  value        jsonb       NOT NULL,
  updated_by   uuid        REFERENCES users(id),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
```

Initial keys (MVP):
- `admin_recipient_email` — string, the address PRD-006 dispute notifications go to (e.g., `admins@sigoalumni.org`).
- `treasurer_recipient_email` — string, the address PRD-005 payment-sent notifications go to (e.g., `@sigoboard.org`).

Future keys land here without schema migrations. Each is editable in PRD-007's "Advanced settings" UI; the value column is `jsonb` so we can grow into structured settings (object / array shapes) without altering the table.

**Resolution rule for app code:** a single `getSetting(key)` helper checks the DB first, falls back to a typed env-var default if absent. This way:
- A fresh instance can boot with sensible env-var defaults baked into `helm-values` / `kustomization.yaml`.
- Admins can override per-instance without a redeploy.
- The DB row "wins" once written.

### Consequences

- **C-01 (good)** — Right tool for each job. Boot-time + secret stays in env vars (with secrets manager); operational stays editable in-app.
- **C-02 (good)** — One simple table covers all Admin-tunable settings, current and future. No schema churn per setting.
- **C-03 (good)** — `jsonb` value lets settings grow from strings to structured shapes (e.g., a future "branding" setting with a logo URL + theme color) without schema changes.
- **C-04 (good)** — Audit-able: `updated_by` + `updated_at` give a basic who/when log without needing a full settings audit table.
- **C-05 (bad)** — Two storage tiers means two places to look for "where is this configured?" Mitigated by (i) the docs naming each setting's tier explicitly, (ii) `getSetting()` being the single read path that hides the bifurcation.
- **C-06 (bad)** — `jsonb` values are weakly typed at the DB layer. App code must validate (Zod schema per setting) before writing. Acceptable cost.
- **C-07 (neutral)** — A future Admin auditing requirement might want a `chapter_settings_history` table; out of scope for MVP, not blocked by this design.
- **C-08 (neutral)** — Per-instance scope means no chapter-vs-chapter setting inheritance. We have one chapter; not a constraint.

### Confirmation

- Unit test: `getSetting(key)` returns DB value when present, env-var fallback when absent, and a typed error if both are missing for a required key.
- Integration test: Admin updates `treasurer_recipient_email` via the Admin view → `getSetting()` returns the new value → next `payment-sent` transition emails the new address.
- AC in PRD-007 §5.1: Admin can edit each MVP setting and see the change reflected on next email send.

## Pros and cons of the options

### Option A — env-var only

All configurable values live in env vars, set at deploy time.

- Good — One tier; trivial to reason about.
- Good — Secrets handling is uniform — everything goes through ESO.
- Bad — Changing the dispute-recipient email is a redeploy. For a launch chapter, this is a real friction point — Admins shouldn't have to ping the operator.
- Bad — PRD-007 R-13 (c) "advanced settings" section has no content; a UI placeholder with no functionality is awkward.

### Option B — DB-backed only

All settings live in the DB, including OIDC config. Bootstrap via migration seeds.

- Good — Single source of truth — Admins control everything.
- Bad — OIDC config is needed *before* any Admin can sign in. Chicken-and-egg.
- Bad — Secrets in DB columns — bad practice; would force per-row encryption.
- Bad — Migration-seeding bootstrap is fragile across environments.

### Option C — hybrid

See §Decision outcome.

- Good — Right tool per job; aligns with the chicken-and-egg constraint and the secrets constraint.
- Bad — Two tiers to remember (mitigated by `getSetting()` and explicit docs).

## More information

- ADR-002 — `BOOTSTRAP_ADMIN_EMAIL` is an example env-var in this hybrid.
- ADR-007 — `OIDC_CLIENT_ID/SECRET/HOSTED_DOMAIN` are examples of env-var-tier settings.
- PRD-001 R-14 — names the two MVP settings that need to be tunable.
- PRD-007 R-13 (c) — owns the Admin UI for editing the DB-backed settings.
- ADR-004 — Drizzle + Postgres + `pgcrypto` for `gen_random_uuid()` (used for `users.id` referenced by `updated_by`).
- ADR-006 — External Secrets Operator + 1Password Connect for env-var delivery.

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial Proposed. Recommendation: Option C (hybrid). |
