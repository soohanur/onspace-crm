# OnspaceCRM API — production image.
#
# Same NestJS binary that powers dev, but with HTTP listener enabled. Uses
# Microsoft's Playwright Python base so the same container can also run the
# scraper if WORKER_ONLY=1 is set (worker compose service reuses this
# image; see docker-compose.prod.yml).
#
# Build:
#   docker build -f apps/api/Dockerfile -t onspace/api:latest .
# Run:
#   docker run --rm -p 4000:4000 \
#     -e DATABASE_URL=... -e REDIS_URL=... onspace/api:latest

FROM mcr.microsoft.com/playwright/python:v1.48.0-jammy AS base
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y curl ca-certificates gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g pnpm@9.12.0 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── deps layer ────────────────────────────────────────────────────────
# Copy manifests first so a code change doesn't bust pnpm cache.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY packages/db/package.json packages/db/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/config/package.json packages/config/
COPY apps/api/package.json apps/api/
COPY apps/scraper/package.json apps/scraper/
RUN pnpm install --frozen-lockfile

# ── build layer ───────────────────────────────────────────────────────
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @onspace/db prisma:generate && \
    pnpm --filter @onspace/api build

# Python scraper deps are baked in regardless — the same image is reused
# by the scraper-worker service (WORKER_ONLY=1) and the scraper child
# process spawned by the API in dev parity mode.
COPY apps/scraper apps/scraper
RUN cd apps/scraper && pip install --no-cache-dir -r requirements.txt

ENV NODE_ENV=production
ENV API_PORT=4000
EXPOSE 4000

CMD ["node", "apps/api/dist/main.js"]
