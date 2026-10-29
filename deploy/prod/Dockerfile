# syntax=docker/dockerfile:1.7

FROM node:22-slim AS workspace

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

RUN npm install --global pnpm@9.15.4

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
COPY packages/backend-core/package.json ./packages/backend-core/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/logger/package.json ./packages/logger/package.json

RUN pnpm install --frozen-lockfile
COPY apps ./apps
COPY packages ./packages
RUN DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres" \
  pnpm --filter @im/db generate
COPY deploy/validate-env.mjs ./deploy/validate-env.mjs

FROM workspace AS runtime

ENV NODE_ENV=production

USER node

EXPOSE 3000

FROM workspace AS web-build

ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN pnpm --filter @im/web build

FROM nginx:1.27-alpine AS web

COPY deploy/prod/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
