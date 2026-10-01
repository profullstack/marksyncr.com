# syntax=docker/dockerfile:1
#
# MarkSyncr web app on Bun: Next.js 16 standalone output served by `bun server.js`.
# dev2 builds this file (/home/anthony/www/marksyncr.com, `dockerfile: Dockerfile`)
# and passes the four NEXT_PUBLIC_* build args declared below. Port 3000, env and
# the /api/health check are unchanged from the Node image.

# Stage 1: dependencies
FROM oven/bun:1.4.0-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/
COPY apps/extension/package.json ./apps/extension/
COPY packages/types/package.json ./packages/types/
COPY packages/core/package.json ./packages/core/
COPY packages/sources/package.json ./packages/sources/
COPY packages/vault/package.json ./packages/vault/
# No git in the image: the root postinstall's git-hook setup is a no-op here.
RUN bun install --frozen-lockfile

# Stage 2: build
FROM deps AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build arguments for the public, build-time values
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_APP_URL

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

# `bun --bun next build` (apps/web build script): Next builds on Bun.
RUN bun run --filter @marksyncr/web build

# Stage 3: runtime
FROM oven/bun:1.4.0-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Docker sets HOSTNAME to the container id; the standalone server must bind all
# interfaces for the published port to reach it.
ENV HOSTNAME=0.0.0.0

# For standalone output, public/ must sit at apps/web/public beside server.js.
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=bun:bun /app/apps/web/.next/standalone ./
COPY --from=builder --chown=bun:bun /app/apps/web/.next/static ./apps/web/.next/static

# The oven/bun image ships a non-root `bun` user.
USER bun
EXPOSE 3000
# 127.0.0.1, not localhost: localhost resolves ::1 first and Next binds IPv4 only.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "apps/web/server.js"]
