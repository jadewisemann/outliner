#!/usr/bin/env bash
# Runs the Worker locally on the real Workers runtime (workerd) through
# `wrangler dev`, with a local SQLite-backed Durable Object. No Cloudflare
# account is needed. Waits until it answers, then leaves it running.
#
#   WORKER_TOKEN=secret bash server/cloudflare/dev.sh     # listens on 127.0.0.1:8788
#
# The sync URL is then http://127.0.0.1:8788/workspace.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
token="${WORKER_TOKEN:?set WORKER_TOKEN}"
port="${WORKER_PORT:-8788}"
log="${WORKER_LOG:-$PWD/wrangler.log}"

echo "OUTLINER_TOKEN=${token}" > "$here/.dev.vars"
(cd "$here" && npx --yes wrangler@4 dev --local --ip 127.0.0.1 --port "$port" > "$log" 2>&1 &)

url="http://127.0.0.1:${port}/workspace"
for _ in $(seq 1 90); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "$url" || true)"
  if [ "$code" = "401" ]; then
    echo "worker is up at $url (unauthenticated GET -> 401)"
    exit 0
  fi
  sleep 2
done
echo "the worker did not come up; log follows"
tail -60 "$log"
exit 1
