#!/usr/bin/env bash
# Polls until the local NATS server accepts authenticated connections.
set -euo pipefail
server="${NATS_URL:-nats://admin:admin-dev@localhost:4222}"
for _ in $(seq 1 60); do
  # `nats rtt` exits 0 even when no server answers; `account info` fails until one accepts the login.
  if nats --server "$server" account info >/dev/null 2>&1; then exit 0; fi
  sleep 1
done
echo "NATS did not become ready" >&2
exit 1
