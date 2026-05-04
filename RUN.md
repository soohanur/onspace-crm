# Run OnspaceCRM locally

| | URL |
|---|---|
| Web | http://localhost:3000 |
| API | http://localhost:4000/api |

## First-time setup

```bash
git clone https://github.com/soohanur/onspace-crm.git
cd onspace-crm
pnpm install
cp .env.example .env
```

Edit `.env` — fill `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` if you want email send. Defaults are fine for everything else.

> Don't have local Postgres + Redis? Follow `docs/SETUP_NO_DOCKER.md` once — `dev.sh` expects them under `~/.local/onspace-dev/`.

## Run everything

```bash
./scripts/dev.sh
```

That single command:
- Frees ports 3000/4000 (kills leftover processes — no port-collision surprises).
- Starts Postgres + Redis (skipped if already running).
- Builds + runs the API on `:4000`.
- Wipes `apps/web/.next` and starts `next dev` on `:3000`.
- Streams both logs prefixed with `[api]` / `[web]` until you Ctrl-C.

When you see `[dev] ✓ ready`, open **http://localhost:3000**.

Stop with **Ctrl-C** — Postgres + Redis stay up (cheap, fine to leave).

> **After a `git pull` that touched `packages/db`**, apply migrations
> once by hand — `dev.sh` deliberately doesn't touch the schema:
> ```bash
> cd packages/db
> DATABASE_URL='postgresql://onspace:onspace@localhost:5432/onspace_crm?schema=public' pnpm exec prisma migrate deploy
> ```

---

## Run API and Web separately (two terminals)

If you want isolated logs or to attach a debugger to one side:

**Terminal 1 — API:**

```bash
cd apps/api
rm -f tsconfig.tsbuildinfo
pnpm exec nest build
set -a; source ../../.env; set +a
node dist/main.js
```

**Terminal 2 — Web:**

```bash
cd apps/web
rm -rf .next
pnpm dev
```

---

## When something breaks

| Symptom | Fix |
|---|---|
| Web 500s with `Cannot find module ./vendor-chunks/...` | `cd apps/web && rm -rf .next && pnpm dev` |
| API endpoints 404 after `git pull` | Old build still running — re-run `./scripts/dev.sh` (it kills + rebuilds) |
| `./scripts/dev.sh` hangs on "waiting for api…" | Tail `.dev-logs/api.log` for the real error |

## Stop / reset

```bash
# Stop API + Web (Postgres + Redis stay)
pkill -f "node dist/main"
pkill -f "next-server"

# Wipe DB (destructive — dev only)
cd packages/db
DATABASE_URL='postgresql://onspace:onspace@localhost:5432/onspace_crm?schema=public' pnpm exec prisma migrate reset --force
```
