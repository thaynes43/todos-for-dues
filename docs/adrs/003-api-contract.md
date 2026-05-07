---
id: ADR-003
title: Use tRPC for the portable domain API; reserve Server Actions for web-only ergonomics
status: Proposed
date: 2026-05-06
deciders: [Tom Haynes]
consulted: []
informed: []
related:
  prds: [PRD-001]
  adrs: [ADR-001, ADR-002]      # web framework, auth
  flows: []                     # docs/flows/walking-skeleton.md pending
  designs: []                   # docs/design/api-conventions.md pending
  supersedes: null
  superseded_by: null
---

## Context and problem statement

Per ADR-001 we chose Next.js (App Router). The framework's natural style is **Server Actions** — server functions called directly from React components. They are productive on the web, but they cannot be called from a React Native client; they are tightly coupled to Next.js's request/response and React Server Components. Per PRD-001 the product is web-first with a likely native iOS/Android future, so the decision we make about *how the web client talks to the server now* determines whether a future native client is a feature add or a from-scratch rewrite of the backend's mutation surface.

This ADR picks the contract for **domain operations** (job posting, claiming, state transitions, role changes, payment marks, etc.). It does not pick the database or ORM (ADR-004), the email provider (ADR-005), or hosting details (ADR-006). It also does not pick a transport for webhooks or OAuth/OIDC callbacks — those are plain HTTP regardless of what we do for domain ops.

## Decision drivers

1. **Mobile-future portability.** A future native client must be able to consume the same domain API without re-implementing the server-side surface.
2. **End-to-end type safety.** Types are agent context. Mismatched types between client and server cost agent productivity and human review time alike.
3. **Minimum additional services.** For MVP, the API runs in the Next.js process. An additional service is operational debt we don't need yet.
4. **Validation primitives that compose** with Better Auth (ADR-002) and the eventual ORM (ADR-004). Zod is the de facto TypeScript choice.
5. **Standard HTTP where it matters.** Webhooks (future Venmo, etc.), OAuth callbacks, and OIDC flows must remain plain HTTP regardless of the domain-API choice.
6. **Agent productivity.** Predictable patterns and a deep training corpus.

## Considered options

- **Option A** — tRPC for domain ops; Next.js Route Handlers for webhooks and OAuth callbacks; Server Actions reserved for web-only form ergonomics.
- **Option B** — REST + Zod (hand-rolled, in-process via Next.js Route Handlers, optionally framed by Hono); shared types via workspace package or codegen.
- **Option C** — Server Actions exclusively for MVP; defer API design to when mobile is actually built.
- **Option D** — GraphQL (Apollo Server / Yoga + codegen).
- **Option E** — Separate API service (Hono / Elysia / Fastify) running alongside Next.js.

## Decision outcome

**Chosen option:** **Option A** — tRPC for the portable domain API, with Next.js Route Handlers for webhooks and OAuth/OIDC callbacks, and Server Actions reserved for web-only ergonomics (signup form post, login form post, password-reset form post — operations that submit a form and immediately redirect, and that a native client would never call).

tRPC delivers end-to-end type safety with zero codegen: a TypeScript router defined on the server is consumable by any TypeScript client, including React Native. The same `@trpc/client` + React Query patterns that the web app uses will work unchanged in a future Expo app, with only the auth transport differing (cookies on web, bearer tokens on mobile — Better Auth supports both per ADR-002). Zod input/output schemas are the single source of truth for shape validation; if a third party ever needs REST, `tRPC-OpenAPI` exposes a subset without re-implementing the surface.

The alternative we explicitly reject is Server-Actions-only (Option C). It saves API ceremony today but defers — without amortizing — the work of building a native-client-callable surface. When the mobile app arrives, the whole domain API gets rebuilt and the web client refactored to consume it. tRPC pays the small organizational cost now and avoids that compounding later.

The split is straightforward and enforceable:
- **Domain mutations and queries** → tRPC procedures.
- **Webhooks, OAuth/OIDC callbacks, file uploads** → Next.js Route Handlers.
- **Web-only form ergonomics** → Server Actions, *only when* the same operation would never be called from a native client.

### Consequences

- **C-01 (good)** — End-to-end type safety with no codegen step. Schemas (Zod) are the contract; types flow through unchanged.
- **C-02 (good)** — Domain operations live in one routable place (the tRPC router). Easy to enumerate, audit, and test as a unit.
- **C-03 (good)** — No additional service in MVP. tRPC is a Next.js Route Handler; K8s deploys stay single-image (consistent with ADR-001).
- **C-04 (good)** — Better Auth's session lookup composes with tRPC's `createContext` — auth check runs once per request and is available to every procedure.
- **C-05 (good)** — Mobile client uses `@trpc/client` + React Query (the same patterns the web client already uses); a `packages/mobile` workspace can import `AppRouter` types directly with no schema sync.
- **C-06 (good)** — Zod schemas are the basis for runtime validation, TypeScript inference, and (later, on demand) OpenAPI export via `tRPC-OpenAPI`.
- **C-07 (bad)** — tRPC requires TypeScript on both ends. ADR-001 already commits us to TS, so this is a restated constraint, not a new one — but a third-party non-TS integration would need OpenAPI export to talk to us.
- **C-08 (bad)** — Procedures are not browsable HTTP endpoints; debugging with `curl` is awkward. Mitigation: enable tRPC's dev panel; export OpenAPI when an external client needs it.
- **C-09 (bad)** — Some patterns sit outside tRPC's sweet spot. **File upload** uses a Route Handler that accepts multipart and returns a resource ID; the domain operation that consumes the upload is a tRPC mutation. **Streaming / subscriptions** are deferred (tRPC v11 supports them; we'll opt in when a real-time need emerges).
- **C-10 (neutral)** — Agents and humans must internalize the convention "domain → tRPC; web-only form ergonomics → Server Action; webhook/callback/upload → Route Handler." Documented in `docs/design/api-conventions.md` (pending) and referenced from PROCESS.md.

### Confirmation

- All domain mutations and queries are defined as tRPC procedures with Zod input and output schemas. No domain mutation lives only in a Server Action.
- Server Actions exist for at most three operations (signup, login, password reset form posts) — each documented as web-only.
- Webhooks and OAuth/OIDC callbacks live under `app/api/.../route.ts` (Next.js Route Handlers).
- The walking-skeleton flow spec includes at least one full-loop tRPC procedure (e.g., `job.post`) called from the web client; a smoke test invokes the same procedure from a stub TypeScript client to prove portability.
- The tRPC router exports an `AppRouter` type intended for import by a future mobile package; this export is treated as a public surface.
- An ESLint rule (or PR-review checklist item) prevents new domain operations from being added as Server Actions only.

## Pros and cons of the options

### Option A — tRPC for domain; Route Handlers for webhooks; Server Actions for web ergonomics

End-to-end TypeScript RPC. Procedures defined on the server are typed at every consumer. Composes with React Query on the client.

- Good — End-to-end type safety with zero codegen.
- Good — Native React Query integration; same hooks/patterns on web and React Native.
- Good — Single Next.js process; no extra K8s service.
- Good — Zod is the canonical validation primitive; composes with Better Auth and the eventual ORM.
- Good — The "domain vs. web ergonomics vs. webhooks" split is clear and enforceable.
- Bad — TypeScript on both ends (already implied by ADR-001).
- Bad — Procedures aren't `curl`-friendly; OpenAPI is opt-in.
- Bad — Agents need to learn the convention; one more rule in `docs/design/api-conventions.md`.

### Option B — REST + Zod (hand-rolled, in-process)

Plain HTTP routes (Next.js Route Handlers, optionally framed by Hono for ergonomics) with Zod for validation. Shared types via workspace package or codegen.

- Good — Standard HTTP; debuggable with `curl`; any client integrates.
- Good — Zod still gives runtime validation.
- Good — OpenAPI export is straightforward.
- Bad — More boilerplate per endpoint (route + handler + schema + types declaration).
- Bad — End-to-end type safety requires either a shared-types workspace package or a generated SDK; both add maintenance.
- Bad — Slower iteration than tRPC for product-shaped CRUD features.

### Option C — Server Actions exclusively for MVP

Use Next.js Server Actions for everything; design an API later when mobile arrives.

- Good — Zero API ceremony; fastest to ship the walking skeleton.
- Bad — Server Actions cannot be called from React Native (or any non-Next-React client). When mobile arrives, the domain API gets rebuilt and the web client refactored to consume it.
- Bad — Defers the work without amortizing it; the cost compounds the longer it's deferred.
- Bad — Domain operations must be tested through Next.js's request lifecycle; no clean unit-test boundary at the API layer.

### Option D — GraphQL (Apollo Server / Yoga + codegen)

Schema-first multi-client API; mature client tooling; Zod-or-similar for validation.

- Good — Strong client-driven querying; multi-client friendly.
- Good — Mature codegen tools (graphql-codegen + Zod / Pothos).
- Bad — Heavier infrastructure (resolvers, dataloaders, schema files); the gap from tRPC is significant for a small team.
- Bad — Less idiomatic with Next.js App Router than tRPC.
- Bad — Smaller agent training-corpus concentration on Apollo-with-RSC specifically.

### Option E — Separate API service (Hono / Elysia / Fastify)

Run an API service alongside Next.js, scaling and deploying independently.

- Good — Clean process boundary; API can scale independently from web.
- Good — Hono / Elysia are very TS-friendly.
- Bad — Two services to operate, build, deploy, and deploy on day one — premature for an MVP.
- Bad — Auth session sharing across services adds setup (cookie-domain alignment or bearer-token-only).
- Bad — Locks us into a topology before we know the shape of load.

## More information

### Convention (will live in `docs/design/api-conventions.md`, pending)

| Operation kind | Where it lives | Notes |
|---|---|---|
| Domain mutation or query (job, role, invite, user) | tRPC procedure | Zod input + output schemas; auth via tRPC context |
| Web form post that redirects (signup, login, password reset) | Server Action | Web-only; never called from a native client |
| Webhook receiver (Venmo etc.) | Next.js Route Handler | Plain HTTP; signature verification |
| OAuth / OIDC callback | Next.js Route Handler | Per Better Auth wiring |
| File upload | Next.js Route Handler (multipart) | Returns a resource ID; downstream domain op is tRPC |
| Live updates (future) | tRPC subscriptions | Defer until a real-time need emerges |

### Auth integration (informative)

- `createTRPCContext` calls `auth.api.getSession` (Better Auth) to attach `user` and `session` to every procedure's context.
- `protectedProcedure` is a tRPC middleware that throws `UNAUTHORIZED` when no session is present.
- `roleProcedure(roles)` is a middleware factory that checks `user.role ∈ roles` and throws `FORBIDDEN` otherwise — used for Moderator/Admin endpoints.
- For mobile (post-MVP), the only difference is the auth transport: bearer token in `Authorization` header instead of cookie. The procedure layer is unchanged.

### Mobile readiness (informative)

- `AppRouter` type is exported from `packages/server` (or wherever the tRPC router lives). A future `packages/mobile` imports the type and uses `@trpc/client` + `@tanstack/react-query` exactly as the web client does.
- `@trpc/client` runs in React Native today; no compatibility work needed.
- No codegen, no schema sync, no API drift between web and mobile.

### Future work this ADR implies

- Add `tRPC-OpenAPI` if/when a third-party integration needs REST. Until then, internal-only is acceptable.
- When the mobile app is built, ship `packages/mobile-client` consuming `AppRouter` types directly.
- Subscriptions / SSE: defer until needed (e.g., live job state transitions for a kanban-style admin view). tRPC v11 supports them.

### Links

- tRPC: <https://trpc.io/>
- tRPC v11 docs: <https://trpc.io/docs/v11>
- `tRPC-OpenAPI`: <https://github.com/jlalmes/trpc-openapi>
- TanStack React Query: <https://tanstack.com/query/latest>

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-06 | Tom Haynes | Initial draft. |
