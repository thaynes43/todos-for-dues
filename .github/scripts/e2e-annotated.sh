#!/usr/bin/env bash
# Run a Playwright invocation and, on failure, surface the failure tail +
# first error-context page snapshot as check-run annotations. Operator pods
# babysitting CI are egress-allowlisted for api.github.com but CANNOT fetch
# Actions log blobs (Azure-hosted) — without annotations a red step is
# undebuggable from the pod. Mirrors the inline pattern of the "e2e — main"
# step; extracted so every invocation gets the same treatment.
#
# usage: e2e-annotated.sh "<annotation title>" <playwright args...>
set -o pipefail
title="$1"
shift
log="/tmp/e2e-step.log"
if pnpm --filter web e2e "$@" 2>&1 | tee "$log"; then
  exit 0
fi
tail=$(grep -aE "✘|[0-9]+\) \[chromium\]|Error|Timeout|timed out|toomanyrequests|failed|passed" "$log" | tail -60 | head -c 3500)
tail="${tail//'%'/%25}"
tail="${tail//$'\n'/%0A}"
tail="${tail//$'\r'/%0D}"
echo "::error title=e2e ${title} failure tail::${tail}"
# Playwright wipes apps/web/test-results at invocation start, so any
# error-context found here belongs to THIS invocation's failures.
ctx_file=$(find apps/web/test-results -name 'error-context.md' 2>/dev/null | sort | head -1)
if [ -n "$ctx_file" ]; then
  ctx=$(head -c 3500 "$ctx_file")
  ctx="${ctx//'%'/%25}"
  ctx="${ctx//$'\n'/%0A}"
  ctx="${ctx//$'\r'/%0D}"
  echo "::error title=e2e ${title} error-context (${ctx_file})::${ctx}"
fi
exit 1
