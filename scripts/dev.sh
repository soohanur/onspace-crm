#!/usr/bin/env bash
# One-shot dev launcher. Brings up Postgres + Redis + API + Web.
#   - Kills anything on ports 3000/4000 first (no port-collision surprises).
#   - Starts Postgres + Redis if they aren't already up.
#   - Applies pending migrations.
#   - Builds the API once and runs the compiled dist (this is what's been
#     ship-tested every phase; `nest start --watch` randomly stalls).
#   - Wipes apps/web/.next then runs `next dev` (avoids the recurring
#     "Cannot find module ./vendor-chunks/..." poison from prior builds).
#   - Streams both logs to this terminal with [api] / [web] prefixes.
#   - Ctrl-C cleanly stops the API + Web children. Postgres/Redis stay up.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEV_HOME="${ONSPACE_DEV_HOME:-$HOME/.local/onspace-dev}"
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

# ─── 2. Postgres ───────────────────────────────────────────────────────
if ! ss -tln 2>/dev/null | grep -q ":5432"; then
  echo "[dev] starting postgres..."
  "$DEV_HOME/pg/bin/pg_ctl" -D "$DEV_HOME/data" \
    -l "$DEV_HOME/logs/pg.log" \
    -o "-p 5432 -k /tmp" start
fi

# ─── 3. Redis ──────────────────────────────────────────────────────────
if ! ss -tln 2>/dev/null | grep -q ":6379"; then
  echo "[dev] starting redis..."
  "$DEV_HOME/bin/redis-server" --port 6379 --daemonize yes \
    --dir "$DEV_HOME/redis-data" \
    --logfile "$DEV_HOME/logs/redis.log"
fi

# ─── 4. Env ────────────────────────────────────────────────────────────
set -a
# shellcheck disable=SC1090,SC1091
[ -f "$ROOT/.env" ] && source "$ROOT/.env"
export DATABASE_URL="${DATABASE_URL:-postgresql://onspace:onspace@localhost:5432/onspace_crm?schema=public}"
export REDIS_HOST="${REDIS_HOST:-localhost}"
export REDIS_PORT="${REDIS_PORT:-6379}"
export API_PORT="${API_PORT:-4000}"
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:4000}"
set +a

# ─── 5. Migrate ────────────────────────────────────────────────────────
echo "[dev] applying migrations..."
(cd "$ROOT/packages/db" && pnpm exec prisma migrate deploy >/dev/null 2>&1)

# ─── 6. Build API ──────────────────────────────────────────────────────
echo "[dev] building api..."
(cd "$ROOT/apps/api" && rm -f tsconfig.tsbuildinfo && pnpm exec nest build >/dev/null)

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

# Tail both logs with prefixes.
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

# Block on either child exiting (or Ctrl-C).
wait -n $API_PID $WEB_PID 2>/dev/null || true
cleanup
