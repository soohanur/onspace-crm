#!/usr/bin/env bash
# One-shot dev launcher. Brings up Postgres + Redis + API + Web in this terminal.
# Stop with Ctrl-C (services keep running; use scripts/stop.sh to fully shut down).

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEV_HOME="${ONSPACE_DEV_HOME:-$HOME/.local/onspace-dev}"

# 1. Postgres
if ! ss -tln 2>/dev/null | grep -q ":5432"; then
  echo "[dev] starting postgres..."
  "$DEV_HOME/pg/bin/pg_ctl" -D "$DEV_HOME/data" -l "$DEV_HOME/logs/pg.log" -o "-p 5432 -k /tmp" start
fi

# 2. Redis
if ! ss -tln 2>/dev/null | grep -q ":6379"; then
  echo "[dev] starting redis..."
  "$DEV_HOME/bin/redis-server" --port 6379 --daemonize yes --dir "$DEV_HOME/redis-data" --logfile "$DEV_HOME/logs/redis.log"
fi

# 3. Env
export DATABASE_URL="postgresql://onspace:onspace@localhost:5432/onspace_crm?schema=public"
export REDIS_HOST=localhost
export REDIS_PORT=6379
export API_PORT=4000
export NEXT_PUBLIC_API_URL=http://localhost:4000

# 4. Migrate (idempotent)
echo "[dev] applying migrations..."
(cd "$ROOT/packages/db" && pnpm exec prisma migrate deploy >/dev/null)

# 5. Run api + web with turbo
cd "$ROOT"
exec pnpm exec turbo run dev --parallel
