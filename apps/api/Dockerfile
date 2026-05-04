# syntax=docker/dockerfile:1.7
# Multi-stage build for the @bukit/api Fastify service.
# Targeted at Railway. Build context is the repo root:
#
#   docker build -f apps/api/Dockerfile -t bukit-api .
#   docker run --env-file apps/api/.env -p 3001:3001 bukit-api

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS base
RUN corepack enable
WORKDIR /repo

# ─── Stage 1: install full workspace deps (cached on manifests) ─────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# ─── Stage 2: build the api + prune dev deps ────────────────────────────
FROM base AS build
COPY --from=deps /repo ./
COPY apps/api ./apps/api

# `prisma generate` runs from the api's build script; it needs the schema
# (just copied above) and pnpm to find the prisma CLI in workspace deps.
RUN pnpm --filter @bukit/api build

# Strip dev deps so the runtime image stays small. CI=1 so pnpm doesn't
# prompt before clearing modules; --ignore-scripts skips re-running prisma
# generate (we already did it in the build step above).
RUN CI=1 pnpm install --prod --frozen-lockfile --ignore-scripts \
  && pnpm store prune

# ─── Stage 3: lean runtime ──────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runtime
RUN corepack enable
WORKDIR /repo

ENV NODE_ENV=production
ENV PORT=3001

# Bring the pruned workspace (node_modules, dist, prisma, manifests) over.
COPY --from=build /repo ./

EXPOSE 3001

# Apply any pending migrations on boot, then start. `migrate deploy` is
# idempotent and safe to run on every cold start.
CMD ["sh", "-c", "pnpm --filter @bukit/api exec prisma migrate deploy && node apps/api/dist/server.js"]
