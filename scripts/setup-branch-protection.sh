#!/usr/bin/env bash
# Idempotently configure branch protection on `main` per PLAN-009 Step 2.5.
#
# Required: `gh auth status` showing a token with `repo` scope.
# Re-running this script is safe — `gh api PUT` overwrites the ruleset
# with the JSON body below.
#
# Settings rationale:
#   - required_status_checks.contexts: must match GHA job names exactly
#     (the `jobs:` keys in .github/workflows/ci.yml — not the
#     `name:` labels which can drift). `build-image` is intentionally
#     excluded; it only runs on tag push, so requiring it would
#     deadlock PR merges.
#   - strict: true — branches must be up-to-date with main before merge
#     (no stale merges).
#   - enforce_admins: false — coordinator break-glass for emergencies.
#     Flip to true post-launch once the agent workflow is stable.
#   - required_pull_request_reviews: null — solo-dev workflow; status
#     checks are the actual gate.
#   - required_linear_history: true — squash- or rebase-merge only.
#   - allow_force_pushes: false, allow_deletions: false.
set -euo pipefail

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
echo "Configuring branch protection on $REPO@main..."

gh api -X PUT "repos/$REPO/branches/main/protection" --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["lint-and-typecheck", "test"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": false,
  "lock_branch": false,
  "allow_fork_syncing": true
}
JSON

echo "Done. Verifying..."
gh api "repos/$REPO/branches/main/protection" -q '{
  contexts: .required_status_checks.contexts,
  strict: .required_status_checks.strict,
  linear_history: .required_linear_history.enabled,
  enforce_admins: .enforce_admins.enabled,
  force_pushes: .allow_force_pushes.enabled
}'
