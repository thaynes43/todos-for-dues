---
id: ADR-001
title: Use Next.js (App Router) + TypeScript for the web app, with Tailwind + shadcn/ui
status: Proposed
date: 2026-05-06
deciders: [Tom Haynes]
consulted: []
informed: []
related:
  prds: [PRD-001]
  adrs: []                    # ADR-002 (auth), ADR-003 (API contract for mobile portability) — pending
  flows: []
  designs: []
  supersedes: null
  superseded_by: null
---

## Context and problem statement

TODOs for Dues is an invite-only, mobile-first SaaS where most users will interact from phones, with a likely future native iOS/Android app. We need to pick the web app framework, language, and UI toolkit as a coherent set — these three choices are tightly coupled (the framework dictates the component model; the component model dictates which UI libraries are realistic). The decision locks in our component language for the foreseeable future and determines whether code sharing with a future native app is realistic.

This ADR does **not** decide auth, the API contract for mobile portability, the database, or the email provider — those are ADR-002 through ADR-005.

## Decision drivers

1. **Agent productivity.** Claude agents will produce most of the implementation. The framework should have deep representation in agent training data and predictable conventions so agents write idiomatic code without churn.
2. **Mobile-future portability.** A native iOS/Android app is likely. The web stack should not preclude shared TypeScript domain code, and ideally shares the component model with the native client.
3. **Mobile-first responsive design.** Most traffic from phones. The CSS approach should make small-screen-first easy and scale up cleanly to desktop.
4. **Type safety end-to-end.** Long-running SaaS, frequent refactors, agents-as-authors — types catch a class of mistakes early and make context easier for agents.
5. **K8s + Docker deployable.** The framework must produce a small, predictable container; no vendor-specific runtime requirement.
6. **Time to MVP.** Walking skeleton ships fast; prefer batteries-included over assembly-required.

## Considered options

- **Option A** — Next.js (App Router) + TypeScript + React + Tailwind + shadcn/ui
- **Option B** — Remix / React Router v7 + TypeScript + React + Tailwind + shadcn/ui
- **Option C** — SvelteKit + TypeScript + Tailwind + Skeleton/DaisyUI
- **Option D** — Nuxt (Vue 3) + TypeScript + Tailwind + Nuxt UI
- **Option E** — Server-rendered monolith (Rails / Phoenix / Django) + Hotwire / LiveView + Tailwind

## Decision outcome

**Chosen option:** **Option A** — Next.js (App Router) + TypeScript + React + Tailwind + shadcn/ui.

The pick is driven primarily by drivers 1 (agent productivity) and 2 (mobile-future portability). Next.js has the deepest training-data footprint of any modern web framework, so agents produce idiomatic code with the least coaching. React is the *only* mainstream component model with a production-grade native code-sharing path (React Native / Expo), so adopting React on the web preserves the option to share components, hooks, and types with a future native app via a monorepo. Tailwind + shadcn/ui give us mobile-first responsive design with an inspectable, agent-editable component layer (shadcn components live in our own repo as plain source). TypeScript is non-negotiable for the agent-author workflow.

The chosen stack does have a sharp edge — Next.js's gravity is toward Server Actions, which are not callable from a React Native client. ADR-003 (pending) will resolve this by establishing a portable API contract (likely tRPC or REST + Zod) for domain operations, so Server Actions are limited to web-only ergonomics (form submits, redirects).

### Consequences

- **C-01 (good)** — Highest agent productivity of the candidates. Claude reliably produces idiomatic Next.js App Router code.
- **C-02 (good)** — React is on the web *and* on the mobile path (Expo). Shared TS types/domain logic in a future monorepo are realistic.
- **C-03 (good)** — Tailwind + shadcn produces mobile-first responsive UI with components agents can read and modify directly (no opaque library indirection).
- **C-04 (good)** — Next.js `output: 'standalone'` produces a small Node image suitable for K8s with no special runtime.
- **C-05 (good)** — Single language (TypeScript) end-to-end if we pair with a TS ORM in ADR-004.
- **C-06 (bad)** — App Router has known rough edges: RSC boundaries, fetch-cache defaults that change per Next major, and confusing error surfaces. Agents occasionally produce code that mixes server/client semantics incorrectly.
- **C-07 (bad)** — Server Actions are tempting and idiomatic but mobile-incompatible. We must consciously route domain operations through a portable API surface (deferred to ADR-003).
- **C-08 (bad)** — shadcn/ui means we own the component source. Upstream improvements require manual port. Acceptable trade-off — we prefer "predictable code in our repo" to "magical library."
- **C-09 (neutral)** — Next.js is Vercel-optimized but cleanly K8s-deployable; we accept missing some Vercel-only features (Edge runtime niceties, ISR with their KV) and stick to the framework primitives that work on a generic Node host.

### Confirmation

- The walking-skeleton design doc (`docs/design/walking-skeleton.md`, pending) specifies Next.js App Router with `output: 'standalone'` and a Dockerfile that produces a runnable image.
- The first deployed instance serves a mobile-first Tailwind-styled page through K8s ingress with TLS.
- shadcn components live in the repo under git (e.g., `components/ui/`), not pulled at build time.
- No Server Action is used for a domain mutation that a future native client would also need to perform — those go through the portable API surface defined in ADR-003.

## Pros and cons of the options

### Option A — Next.js (App Router) + TS + React + Tailwind + shadcn/ui

The default for modern TypeScript SaaS with a web-first launch and mobile aspirations.

- Good — Largest training corpus → fastest agent productivity.
- Good — React keeps the Expo / React Native code-sharing path open.
- Good — Tailwind + shadcn → mobile-first responsive done right; agents can read/edit components.
- Good — TS end-to-end if we pair with a TS ORM (ADR-004).
- Good — `output: 'standalone'` produces a clean K8s container.
- Bad — App Router edges (RSC boundaries, caching surprises).
- Bad — Server Actions are seductive but mobile-incompatible (mitigation: ADR-003).
- Neutral — Vercel-leaning but not Vercel-locked.

### Option B — Remix / React Router v7 + TS + React + Tailwind + shadcn/ui

Web-fundamentals leaning React framework that's now merged into React Router v7.

- Good — Closer to platform primitives (loaders, actions, Web standard Request/Response).
- Good — Same React + Tailwind + shadcn ecosystem; same mobile-future path.
- Good — TypeScript story is excellent; conventions are simpler than Next App Router.
- Bad — Materially smaller training corpus → agents produce more idiomatic Next than Remix.
- Bad — Smaller integration ecosystem; more glue code.
- Bad — The Remix → React Router v7 rebrand introduced documentation churn that's still settling.

### Option C — SvelteKit + TS + Tailwind + Skeleton/DaisyUI

Smaller, simpler, faster framework with excellent ergonomics.

- Good — Smaller bundles, simpler mental model than React.
- Good — Strong mobile-first conventions out of the box.
- Bad — No mainstream React-Native equivalent. Mobile path is a niche (Svelte Native, Capacitor wrapper). Driver 2 effectively fails.
- Bad — Smallest agent training corpus of the considered options. Driver 1 weakest.
- Bad — Smaller component ecosystem; more bespoke UI work.

### Option D — Nuxt (Vue 3) + TS + Tailwind + Nuxt UI

Vue's batteries-included framework, mature and productive.

- Good — Productive DX, Composition API + TS is solid.
- Good — Nuxt UI is a polished component story.
- Bad — Vue has a much smaller training corpus than React in Claude's training data → meaningfully worse agent productivity.
- Bad — No production-grade mobile code-sharing equivalent to React Native. Driver 2 fails.

### Option E — Server-rendered monolith (Rails / Phoenix / Django) + Hotwire / LiveView + Tailwind

The "boring," productive monolith path.

- Good — Massive batteries-included surface (auth, migrations, mailers); fast walking skeleton.
- Good — Hotwire / LiveView are excellent for mobile-first responsive web with minimal JS.
- Good — Agents are fluent in all three.
- Bad — Native mobile sharing is essentially zero. A future iOS/Android app means a fully separate native codebase consuming a REST/GraphQL API. Driver 2 fails hard.
- Bad — Cross-language boundary if any TypeScript joins the stack later.
- Neutral — K8s deploys are well-understood for all three.

## More information

- Next.js App Router docs: <https://nextjs.org/docs/app>
- React Native / Expo (the assumed mobile path): <https://docs.expo.dev/>
- shadcn/ui: <https://ui.shadcn.com/>
- Tailwind CSS: <https://tailwindcss.com/>
- Why shadcn-style "copy-in" beats "library" for agent-authored codebases: components live in `components/ui/` as plain source, so agents read them like any other file rather than relying on framework-specific component knowledge.
- Follow-up ADRs this decision implies:
  - **ADR-002** — Authentication (Better Auth or alternative; invite-token gating).
  - **ADR-003** — API contract for mobile portability (tRPC vs. REST + Zod vs. mixed). This ADR defers Server Actions vs. portable API to ADR-003.
  - **ADR-004** — Database + ORM.
  - **ADR-005** — Email provider.
  - **ADR-006** — Hosting target details (K8s, Postgres location, registry, CI/CD).

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-06 | Tom Haynes | Initial draft. |
