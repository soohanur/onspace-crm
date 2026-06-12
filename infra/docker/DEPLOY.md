# OnspaceCRM — Self-host on Windows + Cloudflare Tunnel

End-to-end: bring the stack up on the Windows box via Docker Desktop,
expose it through a Cloudflare Tunnel, point your domain at it.

## Prereqs on the Windows host

- Docker Desktop running (WSL2 backend)
- Git for Windows
- A domain in Cloudflare (free plan is fine)

## 1. Clone the repo on Windows

```powershell
cd $env:USERPROFILE
git clone https://github.com/soohanur/onspace-crm.git onspaceCRM
cd onspaceCRM
```

## 2. Create the Cloudflare Tunnel

1. Open https://one.dash.cloudflare.com/  → **Networks → Tunnels**.
2. Click **Create a tunnel** → connector type **Cloudflared** → name it
   `onspace-crm`. → Save.
3. On the **Install connector** screen, switch to the **Docker** tab and
   copy ONLY the long `--token eyJ...` value (you won't run that command;
   the compose file already wires it in).
4. Click **Next** → **Public hostnames** tab and add two routes:
   | Subdomain | Domain | Service |
   |-----------|--------|---------|
   | `crm`     | your domain | `HTTP` → `web:3000` |
   | `api`     | your domain | `HTTP` → `api:4000` |
5. Save. Cloudflare will auto-create DNS CNAME records for both.

## 3. Fill in `.env`

```powershell
copy infra\docker\.env.example .env
notepad .env
```

Fill:
- `PUBLIC_WEB_URL=https://crm.yourdomain.com`
- `PUBLIC_API_URL=https://api.yourdomain.com`
- `POSTGRES_PASSWORD=` (anything long + random)
- `JWT_SECRET=` (use `openssl rand -hex 64` in WSL or any 128-char hex)
- `GOOGLE_REDIRECT_URI=https://api.yourdomain.com/auth/google/callback`
- `CLOUDFLARE_TUNNEL_TOKEN=eyJ...` (from step 2 above)

## 4. Bring the stack up

```powershell
docker compose -f infra\docker\docker-compose.prod.yml --env-file .env up -d --build
```

First build is ~10-15 min (Playwright + Node + pnpm). Subsequent builds
hit the layer cache and are seconds.

## 5. Apply DB migrations

```powershell
docker compose -f infra\docker\docker-compose.prod.yml --env-file .env exec api npx --prefix packages/db prisma migrate deploy
```

## 6. Verify

```powershell
docker compose -f infra\docker\docker-compose.prod.yml --env-file .env ps
```

All services should be `Up` / `healthy`. Then:

- `https://crm.yourdomain.com` → the web app
- `https://api.yourdomain.com/api/sequences` → JSON of seeded sequence

## Common ops

```powershell
# Tail logs
docker compose -f infra\docker\docker-compose.prod.yml logs -f api

# Restart one service after a code pull
git pull
docker compose -f infra\docker\docker-compose.prod.yml --env-file .env up -d --build api web

# Stop everything (data persists in volumes)
docker compose -f infra\docker\docker-compose.prod.yml --env-file .env down
```

## Updating the public URL

If you change the hostnames in Cloudflare, you must rebuild `web` because
`NEXT_PUBLIC_API_URL` is baked at build time:

```powershell
docker compose -f infra\docker\docker-compose.prod.yml --env-file .env build --no-cache web
docker compose -f infra\docker\docker-compose.prod.yml --env-file .env up -d web
```
