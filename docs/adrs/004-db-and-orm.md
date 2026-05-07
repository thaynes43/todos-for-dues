---
id: ADR-004
title: Use Postgres + Drizzle for persistence
status: Proposed
date: 2026-05-06
deciders: [Tom Haynes]
consulted: []
informed: []
related:
  prds: [PRD-001]
  adrs: [ADR-001, ADR-002, ADR-003]   # web framework, auth, API contract
  flows: []
  designs: []                         # docs/design/data-model.md pending
  supersedes: null
  superseded_by: null
---

## Context and problem statement

The product needs durable, transactional, relational persistence. PRD-001 implies relational shapes throughout: users with roles, jobs in a state machine, invite tokens, role-change history, role-keyed permissions, and (later) payment-state records. Each instance is single-tenant per fraternal organization (PRD-001 R-11), so we do not need multi-tenant data partitioning at the schema level — one database per deployed instance.

This ADR picks the **database engine** and the **TypeScript persistence layer** (ORM or query builder). It does not pick *where* Postgres runs (managed-vs-in-cluster is ADR-006), the migration runner integration with deploys (design-level detail), or the schema itself (`docs/design/data-model.md` pending).

Database choice (Postgres) was implicit in earlier discussion; it's enumerated below to make the rejection of alternatives explicit. The real decision in this ADR is the ORM.

## Decision drivers

1. **TS-native persistence layer** that composes with ADRs 001–003 (Next.js + Better Auth + tRPC + Zod). One language across the stack reduces agent context-switching.
2. **Schema-as-code** the agent can read like any other source file, without a parallel DSL to learn or codegen step to keep in sync.
3. **First-party adapter for Better Auth** — both Drizzle and Prisma have one. Anything without is a meaningful demerit.
4. **Migrations are first-class** with checked-in SQL; we expect to iterate the schema frequently during MVP.
5. **Runtime weight matters** because we're shipping a Next.js standalone container to K8s — heavier ORMs hit cold-start time and image size.
6. **Validation composability** — the persistence schema should generate or pair with Zod schemas (used by tRPC input/output per ADR-003).
7. **Mature, transactional relational engine** — Postgres or PG-compatible. Greek-life dues data has correctness requirements (loop closure, payment state) that demand transactions and constraints.

## Considered options

### Database engine

- **Postgres** (versions 15+).
- **MySQL / MariaDB** — viable but less feature-rich (JSON, indexing, extensions); fewer modern TS-friendly extensions in the ecosystem.
- **SQLite** — too thin for this workload (concurrency, K8s deploy footprint, lack of true server-mode operations).
- **NoSQL (DynamoDB, Mongo)** — mismatch with the relational shape of the data; rejected without further analysis.

Postgres is the only serious candidate. The remainder of the ADR is the ORM choice.

### ORM / persistence layer

- **Option A** — Drizzle ORM (TypeScript-first, schema-as-code, lightweight runtime).
- **Option B** — Prisma (mature, schema.prisma DSL + codegen, large community).
- **Option C** — Kysely (type-safe query builder; not a full ORM).
- **Option D** — TypeORM / MikroORM (decorator-based, JVM-style ORMs).

## Decision outcome

**Chosen option:** **Postgres + Drizzle**.

Postgres is uncontested. Drizzle wins the ORM call for four converging reasons. First, its schema lives in TypeScript files alongside the rest of the codebase, so agents read it without a separate DSL or a codegen step that can fall out of sync — the schema *is* the source of truth, and `drizzle-zod` derives Zod schemas from it for tRPC input/output reuse. Second, its runtime is materially lighter than Prisma's, which matters for our K8s standalone container's cold-start and image size. Third, `drizzle-kit` generates checked-in SQL migrations that we version like any other code, with no opaque migration engine. Fourth, Better Auth ships a first-party Drizzle adapter that uses the same connection and schema conventions, so auth tables coexist cleanly with domain tables.

Prisma is the credible alternative — bigger community, more worked examples, polished DX. We accept the trade-off: smaller community knowledge for tighter integration with the agent-author workflow and a lighter runtime. Prisma's recent move off the Rust query engine narrows but does not close the runtime-weight gap.

Kysely is appealing for its query-builder discipline but lacks Better Auth integration without community glue, and we'd reinvent ORM-shaped conveniences (relations, schema introspection) ourselves. TypeORM and MikroORM use a decorator style that fits older Express-style codebases better than this stack.

### Consequences

- **C-01 (good)** — Single TypeScript file for each table; agents inspect the schema like any other source. No DSL context-switch.
- **C-02 (good)** — `drizzle-zod` gives Zod schemas derived from the table definitions; reused by tRPC procedures (ADR-003) and input validation. One source, three consumers.
- **C-03 (good)** — `drizzle-kit generate` produces plain SQL migrations checked into `migrations/` and applied via `drizzle-kit migrate` at deploy/start. No opaque migration engine.
- **C-04 (good)** — Better Auth's first-party Drizzle adapter (ADR-002) shares the connection; auth and domain tables coexist in one schema.
- **C-05 (good)** — Light runtime: smaller bundle, faster cold start in the Next.js standalone container.
- **C-06 (bad)** — Smaller community than Prisma; fewer Stack Overflow hits and worked examples. Mitigation: the API surface is small, and the schema-as-TS reduces "unknown unknowns" agents would otherwise hit.
- **C-07 (bad)** — Drizzle has had API churn through its 0.x and 1.x; we'll pin a known-good version and plan upgrade lanes.
- **C-08 (bad)** — Migrations are forward-only by Drizzle convention; rollbacks are handled at the SQL layer (write a new migration that reverses the change). Mitigation: design doc captures the rollback discipline; drift tests guard against unsafe migrations.
- **C-09 (neutral)** — We commit to Postgres-flavored SQL where the schema benefits from extensions (e.g., `pgcrypto` for `gen_random_uuid()`, `citext` for case-insensitive emails). Switching engines later means revisiting these. Acceptable lock-in.

### Confirmation

- Schema lives in `packages/server/src/db/schema/*.ts` (or equivalent monorepo location).
- All migrations are SQL files generated by `drizzle-kit`, checked into git under `migrations/`, and applied at deploy time (mechanism in ADR-006).
- `drizzle-zod` is configured for tables whose Zod schemas feed tRPC procedures.
- Better Auth uses the Drizzle adapter against the same `DATABASE_URL`.
- An integration test creates a fresh database from migrations, seeds a bootstrap Admin per ADR-002, runs one tRPC mutation end-to-end, and tears down — proving the full persistence stack works.
- A drift check (CI step) compares the schema to the latest migration and fails the build if they diverge.

## Pros and cons of the options

### Option A — Postgres + Drizzle

Schema-as-TypeScript ORM with checked-in SQL migrations.

- Good — Schema is plain TypeScript; no DSL or codegen step.
- Good — `drizzle-zod` reuses table definitions as Zod schemas for tRPC.
- Good — Lighter runtime than Prisma; faster cold start; smaller image.
- Good — First-party Better Auth adapter.
- Good — `drizzle-kit` generates plain, reviewable SQL migrations.
- Bad — Smaller community than Prisma; fewer worked examples.
- Bad — API churn through 0.x / 1.x; pin and plan upgrades.
- Bad — Forward-only migrations; rollbacks via reverse-migrations.

### Option B — Postgres + Prisma

Schema-first ORM via `schema.prisma` DSL and a generated client.

- Good — Mature, polished DX; very large community; abundant tutorials.
- Good — First-party Better Auth adapter.
- Good — Migration tooling is mature (`prisma migrate`).
- Good — Excellent IDE integration via the Prisma extension.
- Bad — Schema lives in a separate DSL; agents context-switch between TS and `schema.prisma`.
- Bad — Codegen step (`prisma generate`) adds a build dependency that can fall out of sync.
- Bad — Heavier runtime than Drizzle even after the Rust-engine removal; larger bundle and image.
- Bad — Validation primitives are Prisma-specific; integrating Zod for tRPC requires duplicate definitions or a third-party generator.

### Option C — Postgres + Kysely

Type-safe query builder; you write SQL semantics with TS types.

- Good — Closest to SQL; very predictable runtime; no abstraction surprises.
- Good — Lightest runtime of any option.
- Bad — No first-party Better Auth adapter; community adapters exist but lack maintenance guarantees.
- Bad — More manual: relations, joins, schema introspection are all hand-rolled.
- Bad — No native migration story; pair with `kysely-codegen` and a separate migration tool.

### Option D — Postgres + TypeORM / MikroORM

Decorator-based, JVM-influenced ORM style.

- Good — Mature; Hibernate-shaped patterns familiar to enterprise developers.
- Bad — Decorator-heavy API style is older; less idiomatic in modern Next.js stacks.
- Bad — Smaller modern community; less agent training-corpus concentration.
- Bad — No first-party Better Auth adapter; integration is custom.

## More information

### Schema conventions (informative — final form lives in `docs/design/data-model.md`, pending)

- Primary keys: `uuid` defaulting to `gen_random_uuid()` from `pgcrypto`. (Sortable IDs like ULIDs are an option to revisit if pagination ergonomics demand it.)
- Timestamps: `created_at` and `updated_at` (`timestamptz`) on every domain table; `updated_at` maintained by application code or trigger.
- Soft delete vs. hard delete: defer per-table; default is hard delete unless audit requires retention.
- Email column: `citext` for case-insensitive uniqueness on user emails (consistent with Better Auth conventions).
- Role-change history: separate append-only table (R-09 requires audit history).
- Invite tokens: stored hashed, never plaintext (per ADR-002).

### Migrations and deploy (informative — wired up in ADR-006)

- `drizzle-kit generate` during development produces a SQL file in `migrations/`.
- A migration runner step in the deploy pipeline (init container, sidecar, or pre-start script) applies pending migrations against the target database before the Next.js process starts. Mechanism finalized in ADR-006.
- CI checks: drift test (schema vs. latest migration), forward-application test (apply all migrations against an empty DB), and rollback-discipline test (reverse-migrations apply cleanly).

### Future work this ADR implies

- ADR-006 will pick *where* Postgres runs (managed: Neon / Supabase / RDS, or in-cluster via CloudNativePG operator).
- A future ADR may revisit ULIDs vs. UUIDs if pagination ergonomics demand it.
- Read-replicas, multi-AZ, and backup discipline are post-MVP ops concerns.

### Links

- Drizzle ORM: <https://orm.drizzle.team/>
- `drizzle-kit` (migrations): <https://orm.drizzle.team/docs/kit-overview>
- `drizzle-zod`: <https://orm.drizzle.team/docs/zod>
- Better Auth Drizzle adapter: <https://www.better-auth.com/docs/adapters/drizzle>
- Prisma: <https://www.prisma.io/>
- Kysely: <https://kysely.dev/>

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-06 | Tom Haynes | Initial draft. |
