#!/usr/bin/env bash
# Creates the bship_games bucket and disables rollups on its stream.
# Override the target with NATS_URL, or NATS_CONTEXT to use a saved nats context.
set -euo pipefail

if [[ -n "${NATS_CONTEXT:-}" ]]; then
  NATS=(nats --context "$NATS_CONTEXT")
else
  NATS=(nats --server "${NATS_URL:-nats://admin:admin-dev@localhost:4222}")
fi

if "${NATS[@]}" kv info bship_games >/dev/null 2>&1; then
  echo "bucket bship_games already exists"
else
  "${NATS[@]}" kv add bship_games \
    --history 5 --ttl 90d --max-value-size 16KiB --max-bucket-size 256MiB \
    --replicas 1 --storage file
fi

# `nats stream edit` refuses to run without a TTY on KV streams (even with -f), so
# send the equivalent stream update through the JetStream API: direct get on, rollups off.
config=$("${NATS[@]}" stream info KV_bship_games -j \
  | jq -c '.config | .allow_direct = true | .allow_rollup_hdrs = false')
reply=$("${NATS[@]}" request '$JS.API.STREAM.UPDATE.KV_bship_games' "$config")
if jq -e '.error' >/dev/null <<<"$reply"; then
  echo "stream update failed: $reply" >&2
  exit 1
fi
echo "KV_bship_games: allow_direct on, rollups off"
