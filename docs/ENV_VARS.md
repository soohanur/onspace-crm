# Environment variables

One-page reference for every env var the app reads.

## API (NestJS — apps/api)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | yes (prod) | `development` | Toggles secure-cookie + production behaviors. |
| `PORT` | (Render injects) | — | Render assigns this; we honor it. Falls back to `API_PORT` for local dev. |
| `API_PORT` | dev only | `4000` | Local dev port. |
| `DATABASE_URL` | yes | — | Postgres connection string. Neon uses `?sslmode=require`. |
| `REDIS_URL` | yes | — | Redis connection. `rediss://…` for Upstash TLS. Beats discrete `REDIS_HOST/PORT/PASSWORD`. |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_TLS` | optional | — | Fallback when `REDIS_URL` not set. |
| `JWT_SECRET` | yes | `dev-only-change-me` | HMAC secret. Use `openssl rand -hex 32`. Never commit. |
| `JWT_ACCESS_TTL` | no | `15m` | Cookie + token lifetime. e.g. `15m`, `1h`, `7d`. |
| `FRONTEND_URL` | yes | `http://localhost:3000` | CORS allowlist. Comma-separated for multiple domains. |
| `PLATFORM_ADMIN_EMAIL` | seed only | `admin@onspace.local` | Seeded platform admin email. |
| `PLATFORM_ADMIN_PASSWORD` | seed only | `changeme` | Seeded platform admin password (change on first login). |
| `PUBLIC_API_URL` | prod | — | Public URL of the API. Used by the tunnel module to compose pixel-tracking URLs. |
| `TUNNEL_DISABLED` | dev | — | Set to `1` to skip ngrok/cloudflared auto-spawn. |
| `NGROK_AUTHTOKEN` | dev | — | Use ngrok instead of cloudflared for the tunnel. |

## Web (Next.js — apps/web)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | yes | `http://localhost:4000` | Base URL of the API. Inlined at build time. **Must redeploy after change.** |
| `NEXT_PUBLIC_SCRAPER_DISABLED` | prod | — | Set to `1` on hosts without Python Playwright (e.g. Render free). |

## Local development

Copy [.env.example](../.env.example) → `.env` at repo root. Pre-filled with
defaults that work against `docker compose -f infra/docker/docker-compose.yml up -d`.

## Production

See [README — Production deployment](../README.md#production-deployment-free-tier).
