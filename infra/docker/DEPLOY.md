# OnspaceCRM — Self-host on Windows + Tailscale Funnel (free public URL)

End-to-end: bring the stack up on the Windows box via Docker Desktop,
expose it through Tailscale Funnel (free, no credit card, stable URL).

## Why Tailscale Funnel over Cloudflare Tunnel

- Cloudflare Zero Trust requires a billing card on file even for the
  free tier.
- Tailscale Funnel is free forever, no card, 1 hostname per machine,
  HTTPS handled automatically, URL = `<machine>.<tailnet>.ts.net`.

## Prereqs on the Windows host

- Docker Desktop running (WSL2 backend)
- Git for Windows
- Tailscale installed + signed in (you already have this — IP 100.79.198.15)

## 1. Clone the repo on Windows

```powershell
cd $env:USERPROFILE
git clone https://github.com/soohanur/onspace-crm.git onspaceCRM
cd onspaceCRM
```

## 2. Look up your Tailscale URL

In PowerShell:

```powershell
tailscale status
```

Find your machine name (lowercase, e.g. `desktop-u7er3ui`) and tailnet
name (e.g. `tail1234.ts.net`). The Funnel URL will be
`https://<machine>.<tailnet>`.

## 3. Fill in `.env`

```powershell
copy infra\docker\.env.example .env
notepad .env
```

Fill:
- `PUBLIC_WEB_URL=https://<machine>.<tailnet>` (same URL serves web + api)
- `PUBLIC_API_URL=https://<machine>.<tailnet>`
- `POSTGRES_PASSWORD=` (anything long + random)
- `JWT_SECRET=` (128 hex chars; in WSL: `openssl rand -hex 64`)
- `GOOGLE_REDIRECT_URI=https://<machine>.<tailnet>/auth/google/callback`

## 4. Bring the stack up

```powershell
docker compose -f infra\docker\docker-compose.prod.yml --env-file .env up -d --build
```

First build is ~10–15 min (Playwright + Node + pnpm). Subsequent builds
hit the layer cache and are seconds.

## 5. Apply DB migrations

```powershell
docker compose -f infra\docker\docker-compose.prod.yml --env-file .env exec api npx --prefix packages/db prisma migrate deploy
```

## 6. Enable Tailscale Funnel (the public URL)

The compose file binds `web` to `127.0.0.1:3000` and `api` to
`127.0.0.1:4000` on the Windows host. We tell Tailscale to publish
both behind one HTTPS hostname:

Open PowerShell **as Administrator** on the Windows box:

```powershell
# Clear any prior config (safe to re-run)
tailscale serve reset

# Web at the root /
tailscale serve --bg --https=443 / http://127.0.0.1:3000

# API at /api (Nest already mounts everything under /api)
tailscale serve --bg --https=443 /api http://127.0.0.1:4000

# Publish publicly via Funnel
tailscale funnel 443 on

# Confirm + print the URL
tailscale serve status
```

`tailscale serve status` prints your public URL, e.g.
`https://desktop-u7er3ui.tail1234.ts.net`. That's the URL to put in
`PUBLIC_WEB_URL` / `PUBLIC_API_URL` in `.env` (if you hadn't already)
and rebuild web:

```powershell
docker compose -f infra\docker\docker-compose.prod.yml --env-file .env build --no-cache web
docker compose -f infra\docker\docker-compose.prod.yml --env-file .env up -d web
```

## 7. Verify

- `https://<machine>.<tailnet>/` → the web app
- `https://<machine>.<tailnet>/api/sequences` → JSON of the seeded sequence

## Using your own domain (optional, still free)

If you own a domain (any registrar, doesn't have to be on Cloudflare),
add a CNAME record:

```
crm.yourdomain.com   CNAME   desktop-u7er3ui.tail1234.ts.net
```

Then in `.env` set `PUBLIC_WEB_URL=https://crm.yourdomain.com` and
rebuild web. Tailscale issues a valid LetsEncrypt cert for the tailnet
URL — the CNAME just aliases your custom hostname to it.

## Common ops

```powershell
# Tail logs
docker compose -f infra\docker\docker-compose.prod.yml logs -f api

# Restart one service after a code pull
git pull
docker compose -f infra\docker\docker-compose.prod.yml --env-file .env up -d --build api web

# Stop everything (data persists in volumes)
docker compose -f infra\docker\docker-compose.prod.yml --env-file .env down

# Turn the public URL off
tailscale funnel 443 off
```

## Troubleshooting

- `tailscale funnel 443 on` says "not supported" → your tailnet doesn't
  have Funnel enabled. Go to https://login.tailscale.com/admin/dns →
  **Funnel** section → toggle on. Free.
- 502 from the Funnel URL → containers not running. Check
  `docker compose ps`.
- Web loads but API calls 404 → `NEXT_PUBLIC_API_URL` was baked at the
  wrong URL. Rebuild `web` after fixing `.env`.
