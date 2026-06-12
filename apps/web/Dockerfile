# OnspaceCRM Web — production image.
#
# Two-stage build: pnpm-install + next build in a builder stage, then a slim
# Node 22 runner stage hosting only the standalone bundle. Requires
# `output: 'standalone'` in apps/web/next.config.mjs.
#
# NEXT_PUBLIC_API_URL is baked at build time (Next 15 NEXT_PUBLIC_* are
# build-time-only). Pass via --build-arg or compose's `build.args`.
#
# Build:
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
#     -t onspace/web:latest .

FROM node:22-bookworm-slim AS builder
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/config/package.json packages/config/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# build
COPY packages/shared-types packages/shared-types
COPY packages/config packages/config
COPY apps/web apps/web

# Build-time public env. Default points at sibling api container (only
# useful for same-host curls; users hit the URL the build was tagged for).
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm --filter @onspace/web build

# ── runner ────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Standalone server.js + minimal node_modules
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
