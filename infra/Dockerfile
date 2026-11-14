# syntax=docker/dockerfile:1
# Resolve/pin these build arguments to reviewed digests in the release workflow.
ARG NODE_IMAGE=node:22-trixie-slim@sha256:68c76cfad89921b927eae28ba21407475e29d0ce450afcdbe70c1532db042b64
FROM ${NODE_IMAGE} AS source
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY apps/web/package.json apps/web/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .

FROM source AS build-web
ENV NEXT_TELEMETRY_DISABLED=1
# Runtime SITE_URL/PUBLIC_API_URL override these non-secret build placeholders.
ENV API_INTERNAL_URL=http://127.0.0.1:9 SITE_URL=https://example.invalid PUBLIC_API_URL=https://api.example.invalid
RUN pnpm --filter @stella/web build

FROM source AS build-admin
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @stella/admin build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOME=/tmp
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
USER 1000:1000

FROM runtime AS web
COPY --from=build-web --chown=1000:1000 /app /app
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]

FROM runtime AS admin
LABEL org.stella.admin-ui="dashboard"
COPY --from=build-admin --chown=1000:1000 /app /app
WORKDIR /app/apps/admin
EXPOSE 3001
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3001"]

FROM runtime AS api
USER root
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=source --chown=1000:1000 /app /app
USER 1000:1000
ENV HOST=0.0.0.0 PORT=4000
EXPOSE 4000
CMD ["node", "--import", "tsx", "apps/api/src/server.ts"]
