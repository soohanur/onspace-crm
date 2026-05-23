#!/usr/bin/env bash
# One-shot dev launcher.
#
# Reads DATABASE_URL + REDIS_URL from .env at the repo root and works with:
#   - cloud DB/Redis (Neon + Upstash) — skips local infra
#   - local docker (postgres + redis on :5432 / :6379) — starts via
#     `pnpm infra:up` if not already running
#
# Behaviour:
#   - Kills anything on ports 3000/4000 first (no collision surprises).
#   - Builds the API once and runs the compiled dist (nest --watch has
#     historically been flaky in this repo).
#   - Wipes apps/web/.next then runs `next dev`.
#   - Streams both logs to this terminal with [api] / [web] prefixes.
#   - Ctrl-C cleanly stops the API + Web children.
#
# Migrations are NOT auto-applied. Run by hand when packages/db changes:
#   pnpm db:migrate

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/.dev-logs"
mkdir -p "$LOG_DIR"

API_LOG="$LOG_DIR/api.log"
WEB_LOG="$LOG_DIR/web.log"

# ─── 1. Free up ports ──────────────────────────────────────────────────
for port in 3000 4000; do
  pid=$(lsof -tiTCP:$port -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo "[dev] killing leftover process on :$port (pid $pid)"
    kill -9 $pid 2>/dev/null || true
  fi
done
pkill -f "next-server" 2>/dev/null || true
pkill -f "node dist/main" 2>/dev/null || true
sleep 1

# ─── 2. Load .env ──────────────────────────────────────────────────────
set -a
# shellcheck disable=SC1090,SC1091
[ -f "$ROOT/.env" ] && source "$ROOT/.env"
export DATABASE_URL="${DATABASE_URL:-postgresql://onspace:onspace@localhost:5432/onspace_crm?schema=public}"
export REDIS_HOST="${REDIS_HOST:-localhost}"
export REDIS_PORT="${REDIS_PORT:-6379}"
export API_PORT="${API_PORT:-4000}"
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:4000}"
set +a

# If .env points at a remote redis (Upstash etc.) but local redis is
# already listening on 6379, prefer local — BullMQ polls Redis aggressively
# and a free remote quota burns out in minutes. Override with
# `DEV_USE_CLOUD_REDIS=1` in your env to opt back into the remote one.
if [ "${DEV_USE_CLOUD_REDIS:-0}" != "1" ] \
   && ss -tln 2>/dev/null | grep -q ":6379" \
   && [ -n "${REDIS_URL:-}" ] \
   && ! echo "$REDIS_URL" | grep -qE "localhost|127\.0\.0\.1"; then
  echo "[dev] overriding REDIS_URL → redis://localhost:6379 (local redis is up; BullMQ polls hammer cloud quotas)"
  export REDIS_URL="redis://localhost:6379"
  export REDIS_HOST="localhost"
  export REDIS_PORT="6379"
fi

# ─── 3. Decide if we need local infra ──────────────────────────────────
needs_local_pg=0
needs_local_redis=0
case "$DATABASE_URL" in
  *localhost*|*127.0.0.1*) needs_local_pg=1 ;;
esac
if [ -z "${REDIS_URL:-}" ] || echo "$REDIS_URL" | grep -qE "localhost|127\.0\.0\.1"; then
  needs_local_redis=1
fi

# ─── 4. Start local infra if required ──────────────────────────────────
start_local_infra=0
[ "$needs_local_pg" = "1" ] && ! ss -tln 2>/dev/null | grep -q ":5432" && start_local_infra=1
[ "$needs_local_redis" = "1" ] && ! ss -tln 2>/dev/null | grep -q ":6379" && start_local_infra=1

if [ "$start_local_infra" = "1" ]; then
  if command -v docker >/dev/null 2>&1; then
    echo "[dev] starting local postgres + redis via docker..."
    (cd "$ROOT" && docker compose -f infra/docker/docker-compose.yml up -d) || \
      echo "[dev] docker compose failed — ensure your user is in the docker group or run with sudo"
  else
    echo "[dev] WARNING: docker not installed and DATABASE_URL/REDIS_URL point to localhost."
    echo "[dev]          either install docker, or set cloud URLs in .env"
  fi
fi

# ─── 5. Connection summary ─────────────────────────────────────────────
db_host=$(echo "$DATABASE_URL" | sed -E 's|.*@([^/]+)/.*|\1|')
redis_host="${REDIS_URL:-redis://$REDIS_HOST:$REDIS_PORT}"
echo "[dev] DB    → $db_host"
echo "[dev] redis → $redis_host"

# ─── 6. Build API ──────────────────────────────────────────────────────
# Always wipe dist + tsbuildinfo. Incremental nest builds have shipped stale
# bundles after schema/module changes; full rebuild is cheap (~6s) and safe.
echo "[dev] building api..."
BUILD_LOG="$LOG_DIR/api-build.log"
if ! (cd "$ROOT/apps/api" && rm -rf dist tsconfig.tsbuildinfo && pnpm exec nest build) >"$BUILD_LOG" 2>&1; then
  echo "[dev] api build FAILED — see $BUILD_LOG (tail below):"
  tail -40 "$BUILD_LOG" | sed 's/^/[build] /'
  exit 1
fi
if [ ! -f "$ROOT/apps/api/dist/main.js" ]; then
  echo "[dev] api build succeeded but dist/main.js missing — see $BUILD_LOG"
  exit 1
fi

# ─── 7. Wipe .next ─────────────────────────────────────────────────────
rm -rf "$ROOT/apps/web/.next"

# ─── 8. Start API + Web in background, prefix their logs ───────────────
: >"$API_LOG"
: >"$WEB_LOG"
(cd "$ROOT/apps/api" && node dist/main.js) >"$API_LOG" 2>&1 &
API_PID=$!
(cd "$ROOT/apps/web" && pnpm dev) >"$WEB_LOG" 2>&1 &
WEB_PID=$!

TAIL_API=""
TAIL_WEB=""

cleanup() {
  echo
  echo "[dev] stopping…"
  [ -n "$TAIL_API" ] && kill $TAIL_API 2>/dev/null || true
  [ -n "$TAIL_WEB" ] && kill $TAIL_WEB 2>/dev/null || true
  kill -9 $API_PID 2>/dev/null || true
  kill -9 $WEB_PID 2>/dev/null || true
  pkill -P $API_PID 2>/dev/null || true
  pkill -P $WEB_PID 2>/dev/null || true
  pkill -f "next-server" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

tail -n +1 -F "$API_LOG" 2>/dev/null | sed -u 's/^/[api] /' &
TAIL_API=$!
tail -n +1 -F "$WEB_LOG" 2>/dev/null | sed -u 's/^/[web] /' &
TAIL_WEB=$!

# ─── 9. Wait for both to be ready, then announce ───────────────────────
echo "[dev] waiting for api on :4000 and web on :3000..."
for _ in $(seq 1 90); do
  if curl -sf -o /dev/null http://localhost:4000/api/health 2>/dev/null \
     && curl -sf -o /dev/null http://localhost:3000 2>/dev/null; then
    echo
    echo "[dev] ✓ ready"
    echo "[dev]   web: http://localhost:3000"
    echo "[dev]   api: http://localhost:4000/api"
    echo "[dev] (Ctrl-C to stop)"
    break
  fi
  sleep 1
done

wait -n $API_PID $WEB_PID 2>/dev/null || true
cleanup
