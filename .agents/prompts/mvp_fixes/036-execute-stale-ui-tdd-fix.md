# Prompt for Claude Code agent — Execute stale-UI-after-mutation TDD fix (MVP-FIX-A)

You are a fresh Claude Code agent. You have no prior conversation context. **You are a developer agent — load `.agents/profiles/developer.md` first.** Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright; self-hosted on `haynes-ops`). v0.7.3 deployed to production; user has done a click-through and surfaced a systemic UI bug.

The bug (user's words): "When I click Enroll as an Active the button moves a little but doesn't change from Enroll to Unenroll. Once I go into another window and go back it says Unenroll. The same thing happens when I press Unenroll from the 'My enrollments' screen." + "When I moderate a job, either approve or reject, the page does not update to show which button I pressed and the job still shows Awaiting Moderation. I have to manually refresh the page to get it to update."

**Root cause (coordinator analysis, already-grounded):**

All affected mutation buttons invalidate the client-side React Query cache via `utils.X.invalidate()` in their `onSuccess` handler but **do not call `router.refresh()`**. The parent pages (`/jobs/[id]`, `/my-enrollments`, `/moderation-queue`, etc.) are Next.js App Router **server components** that fetch via the tRPC **server-side caller** at render time. Without `router.refresh()`, the server-rendered HTML stays frozen until full navigation. The correct pattern is already in place in `apps/web/components/RoleChangeDropdown.tsx:43` — it calls `router.refresh()` in its `onSuccess`. The other 17 mutation-using components do NOT (audit pending).

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task — TDD discipline (the user said "TDD"; this is non-negotiable)

1. **REPRODUCE FIRST.** Write a Playwright spec at `apps/web/e2e/mvp/stale-ui-after-mutation.spec.ts` that demonstrates the bug across at least **4 flows** (one assertion per flow):
   - Active enrolls in an `enrollment_open` job → the JobDetailView swaps from rendering `<EnrollButton>` to rendering `<UnenrollButton>` **without page navigation, within 5s**.
   - Active on `/my-enrollments` clicks Unenroll → the job row disappears from the rendered list **without page navigation, within 5s**.
   - Moderator on `/moderation-queue` clicks Approve → the job row disappears from the queue (state moved to `enrollment_open`) **without page navigation, within 5s**.
   - Moderator clicks Reject (with a reason) → same: row disappears from the moderation queue without navigation.

2. **RUN THE SPEC ONCE BEFORE ANY FIX.** Confirm the spec fails — and which assertion fails for what reason. Capture this in your report. **Do NOT skip this step.** If the spec passes before your fix lands, your repro is wrong (you may have inadvertently used a server-side action / page reload). Fix the repro until it fails for the right reason.

3. **AUDIT all 19 `useMutation` callers in `apps/web/components/`.** Excluding `RoleChangeDropdown.tsx` (which is already correct), determine for each: is the data the parent page renders fetched server-side (Next.js RSC / `caller.X.Y(...)` in `page.tsx`) or client-side (`trpc.X.Y.useQuery(...)`)?
   - **If server-side:** add `router.refresh()` to the mutation's `onSuccess` after the `invalidate()` calls. Mirror `RoleChangeDropdown.tsx`'s shape (`useRouter()` hook at the top of the component; `router.refresh()` after invalidate; preserve any existing `onSuccess?.()` callback ordering).
   - **If client-side via `useQuery`:** the existing `invalidate()` alone is sufficient — adding `router.refresh()` is harmless but unnecessary; leave the component alone unless you have evidence it's needed.
   - **If the component navigates away (e.g., `PostJobForm` does `router.push(...)`):** no refresh needed; navigation gets fresh server data automatically.

4. **RE-RUN THE SPEC.** All 4 cases must pass.

5. **RUN ALL CROSS-PLAN INVARIANTS.** Full list below in "Definition of done."

6. **OPEN PR.** `fix(web):` prefix. release-please will bump to v0.7.x patch (this is a real prod bug fix). PR body documents which components got `router.refresh()` added.

## What to read FIRST (in order)

1. **`.agents/profiles/developer.md`** — §1–§7 loop.
2. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md`.
3. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md`.
4. `apps/web/AGENTS.md` (one line; always read — Next.js 16 reminder).
5. **The correct pattern:** `apps/web/components/RoleChangeDropdown.tsx` (lines 33–53). This is the model. Mirror its shape exactly.
6. **The broken components (read all three before changing any):**
   - `apps/web/components/EnrollButton.tsx` (40 lines).
   - `apps/web/components/UnenrollButton.tsx` (43 lines).
   - `apps/web/components/ApproveRejectButtons.tsx` (73 lines).
7. **The 16 other `useMutation` callers** — list them first, audit second:
   ```sh
   grep -l "useMutation" apps/web/components/*.tsx
   ```
   Expected file list: `ApproveRejectButtons`, `CancelJobModal`, `CompleteJobForm`, `ConfirmReceivedButton`, `EnrollButton`, `DisputeJobModal`, `MintInviteButton`, `LockJobForm`, `RevertCompletionButton`, `MarkPaymentSentButton`, `RevokeInviteButton`, `RescheduleButton`, `UserListTable`, `PostJobForm`, `SettingsForm`, `ResolveDisputeModal`, `RoleChangeDropdown`, `UnenrollButton`, possibly one more.
8. **The parent server-component pages (sample of three; grep for `caller.` patterns to find all):**
   - `apps/web/app/jobs/[jobId]/page.tsx` — JobDetailView host. Check whether it uses server caller.
   - `apps/web/app/my-enrollments/page.tsx`.
   - `apps/web/app/moderation-queue/page.tsx`.
9. **Existing e2e patterns to mirror for cross-suite safety:**
   - `apps/web/e2e/mvp/support.ts` — `seedCast` / persona helpers. Use these (suffixed by `newSuffix()`) so your spec is parallel-safe.
   - `apps/web/e2e/admin/invites.spec.ts` — the UUID-data-attribute self-filter pattern from PR #35. If your spec needs to assert "this specific job's row appeared / disappeared", filter by `data-job-id` (or equivalent) rather than by count.
   - `apps/web/e2e/walking-skeleton/support/personas.ts:signInAs` — uses regex `/\/(jobs|moderation-queue)?$/`. If your spec re-signs-in, use this helper.

## What you do NOT do

- **Do not push directly to `main`** — branch protection rejects it.
- **Do not modify anything under `docs/`** (PRDs, ADRs, designs, plans, DDD). The coordinator updates docs after merge.
- **Do not modify `packages/db/`, `packages/domain/`, or `packages/db/migrations/`.** This is a UI-only fix; no schema or domain changes.
- **Do not modify any tRPC procedure** (`packages/api/src/routers/`). The mutations themselves work correctly; only the client-side post-success refresh is missing.
- **Do not blanket-apply `router.refresh()` to every `useMutation`** without auditing. Some components (like `PostJobForm`) navigate away and don't need it; over-refreshing is wasteful and could cause UX glitches.
- **Do not skip the "run failing test first" step.** TDD discipline is the whole point of this prompt. If the test passes before your fix, the test is wrong.
- **Do not add `retries` to any spec** to mask race-conditional flake.
- **Do not relax iteration-2 hardening** (`prewarmRoutes`, `expect.timeout: 15_000`, `networkidle`/`load` waits, `demoteAllOtherAdmins` signature, `invites.spec.ts` UUID assertion).
- **Do not bypass branch protection** (`gh pr merge --admin`, `--no-verify`).
- **Do not change the test DB engine** — PG16 via testcontainers per ADR-004.
- **Do not fold in any other bug from the user's list (#1, #2, #3, #5, #6, #7).** Those are MVP-FIX-B + feature plans (separate prompts).

## Specific traps to watch for

**Trap 1 — Confirming the test FAILS for the right reason before fixing.**

Run your new spec once with the broken code intact. The expected failure: timeout waiting for the post-mutation UI element (UnenrollButton, missing job row, etc.) within 5s. Capture the exact failure mode + screenshot. **Document this in your report under "Repro confirmation."** If the spec passes with the broken code, either (a) you're using a server action / form submit that triggers a full nav (defeats the repro), or (b) you're not asserting on the UI change you think you are. Fix the repro until the failure is specifically the post-success UI staleness.

**Trap 2 — `router.refresh()` placement.**

Mirror `RoleChangeDropdown.tsx:38-45` exactly:
```ts
const router = useRouter();
// ...
const myMutation = trpc.X.Y.useMutation({
  onSuccess: async () => {
    await utils.someQuery.invalidate({ args });
    router.refresh();
  },
});
```

Order: `invalidate()` first, then `refresh()`. The invalidate clears the client cache so any client-side `useQuery` consumers re-fetch; the refresh re-renders server components. Both are needed if the component sits inside a server-rendered page that ALSO has client `useQuery` consumers further down the tree.

`useRouter` import: `import { useRouter } from 'next/navigation';` (App Router). NOT `next/router` (Pages Router, deprecated in Next 16).

**Trap 3 — Audit, don't blanket-apply.**

For each of the 18 components (excluding `RoleChangeDropdown`):
- Find its host page (grep for the component's import in `apps/web/app/`).
- Open the host page; check whether it's `'use client'` (top-of-file directive) or a default server component.
- If server component → host renders via `caller.X.Y(...)` → component needs `router.refresh()`.
- If client component using `useQuery` for the data the mutation invalidates → existing `invalidate()` is sufficient; LEAVE IT.
- If the mutation triggers navigation (`router.push(...)`) → no refresh needed.

Document your audit decisions in the PR body so the next reader knows why each component was or wasn't changed.

**Trap 4 — Cross-suite test safety.**

Your new spec runs as part of `e2e/mvp/` under the full suite-level collapse from PR #36. Cross-spec safety rules (per PR #35's pattern):
- Use `seedCast(pool, newSuffix())` for persona seeding — UUID-suffixed names/emails.
- Assert on rows/buttons filtered by the spec's seeded entity IDs (data-attributes), NOT by count.
- Don't rely on chapter-wide state (`count(Admin) = 1` etc.) — that's the chapter-state-pair architectural concern (out of scope here).

The new spec MUST pass 3× consecutively under DEFAULT workers as part of the full-suite run, not just in isolation.

**Trap 5 — Test wait shape.**

For "UI updates without page navigation," the assertion should look like:
```ts
await expect(page.getByTestId('unenroll-button')).toBeVisible({ timeout: 5_000 });
```
NOT `await page.waitForURL(...)` (no navigation happens) and NOT `await page.reload()` (defeats the test). The `timeout: 5_000` is generous — the fix should make the swap visible in ~100-500ms, but iteration-2 hardening sets `expect.timeout: 15_000` globally; 5s is an explicit tighter assertion that the swap is fast.

**Trap 6 — Adding `useRouter` may require lifting the `'use client'` directive (it shouldn't).**

`'use client'` is already at the top of every component in `apps/web/components/`. `useRouter` is a client hook; no additional setup needed. If a component currently lacks the directive, that's a different bug — flag and skip rather than restructuring.

**Trap 7 — `MintInviteButton` and `RevokeInviteButton` on `/admin/invites`.**

Check `apps/web/app/admin/invites/page.tsx` — is the invite list rendered server-side or client-side? If server-side (caller pattern), the existing PR #35 `invites.spec.ts` UUID-self-filter assertion may currently rely on the stale-UI bug NOT existing (passes because the list is rendered by the test reading the page that loaded AFTER the mint — i.e., navigation already happened). If your fix changes when invites render, surface it; don't break PR #35's assertion.

**Trap 8 — Cross-plan invariants.**

After your work:
- `pnpm -r typecheck` exits 0.
- `pnpm -r test` exits 0 (Vitest counts not regressed).
- `pnpm --filter @app/domain test no-direct-state-writes` exits 0.
- `unset DATABASE_URL && pnpm --filter web build` exits 0 (lazy-Proxy invariant).
- `pnpm --filter web e2e` exits 0 across **3 consecutive runs** under DEFAULT workers. New spec must pass 3×.

**Trap 9 — PR title.**

Recommended: `fix(web): router.refresh after mutation onSuccess in server-component pages (stale UI bug)`. `fix(web):` triggers a patch bump → v0.7.x → v0.7.x+1. Release-please will open a release PR; coordinator decides whether to ride.

**Trap 10 — Don't fold in moderation queue header (#3), button visibility (#6), or lock validation (#7).**

Those three are scoped for a separate prompt (037 — UI polish bundle). Stay in lane. If you notice them while editing, leave them; the coordinator dispatches a follow-up prompt.

## PR-flow specifics

1. `git checkout main && git pull --ff-only origin main`.
2. `git checkout -b fix-stale-ui-after-mutation` off latest `origin/main`.
3. **Write the failing spec first.** `apps/web/e2e/mvp/stale-ui-after-mutation.spec.ts`.
4. **Run it. Confirm failure.** Capture output for your report.
5. Audit 18 components; add `router.refresh()` where needed.
6. **Re-run the spec. All 4 cases must pass.**
7. Run cross-plan invariants locally (Trap 8).
8. Run full `pnpm --filter web e2e` **3× consecutively** under DEFAULT workers. All 3 must be green.
9. Commit. Body explains: (a) the 4 repro cases, (b) the audit table — which components got the refresh, which didn't, why.
10. `git push -u origin fix-stale-ui-after-mutation`.
11. `gh pr create --base main --head fix-stale-ui-after-mutation --title 'fix(web): router.refresh after mutation onSuccess in server-component pages (stale UI bug)' --body '<PR body>'`.
12. Wait for CI green.
13. **Gate 1 — STOP.** Report + await merge authorization.

**Do not merge the PR yourself.**

## Definition of done

- [ ] `apps/web/e2e/mvp/stale-ui-after-mutation.spec.ts` exists; covers ≥4 flows (Enroll, Unenroll, Approve, Reject).
- [ ] The spec was verified to FAIL before any fix landed (documented in report).
- [ ] Audit of all 18 `useMutation` components completed; PR body has the per-component decision table.
- [ ] `router.refresh()` added to all server-component-hosted mutation buttons; matches `RoleChangeDropdown.tsx`'s shape.
- [ ] `pnpm -r typecheck` exits 0.
- [ ] `pnpm -r test` exits 0; Vitest counts not regressed.
- [ ] `pnpm --filter @app/domain test no-direct-state-writes` exits 0.
- [ ] `unset DATABASE_URL && pnpm --filter web build` exits 0.
- [ ] `pnpm --filter web e2e` exits 0 across **3 consecutive runs** under DEFAULT workers.
- [ ] No production code touched outside `apps/web/components/*.tsx` (and the new spec under `apps/web/e2e/mvp/`).
- [ ] No `docs/` touched.
- [ ] PR open against `main` with `fix(web):` title; required CI green; advisory `playwright` green.

## What to report back (under 350 words)

- PR URL + commit hash.
- **The failing-test run output** (the assertion that failed for which flow, before any fix). Quote the Playwright error if useful.
- **The audit table** — one row per `useMutation` component: file path, host page (server / client / navigates-away), action taken (refresh added / no change / N/A).
- Confirmation each cross-plan invariant green.
- Confirmation `pnpm --filter web e2e` ran 3× consecutively under DEFAULT workers — all green. **State explicitly; do not hand-wave.**
- Any component where the right answer was non-obvious (e.g., a page that mixes server-caller + client-useQuery for related data).

## If you get stuck

Escalate with: (1) which step / which component, (2) exact error, (3) what you tried, (4) your lean.

Particular escalation candidates:
- **Repro doesn't fail.** You may have a server action / form-submit path that triggers full nav. Try a `click()` that doesn't reload. If you can't get the repro to fail, the user's report may be more nuanced than coordinator's grounding — flag.
- **`router.refresh()` causes a regression in an unrelated spec.** Possibly a server-component re-render now causes a different stale-state issue elsewhere. Surface the failing spec; lean is "the existing spec was relying on the stale UI"; coordinator decides whether to fix the spec or the production code.
- **A component uses `useQuery` for the data its mutation invalidates AND the host page is a server component.** Mixed model. Lean: add `router.refresh()` — it covers both paths. Document in the audit table.
- **`PostJobForm` (or any other component) does both `router.push(...)` AND should invalidate something on the *destination* page.** Lean: `router.push` is enough since the destination will re-render server-side. If the destination needs cache invalidation too, surface — that's a different pattern.

Begin.
