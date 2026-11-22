# syntax=docker/dockerfile:1
# Resolve/pin these build arguments to reviewed digests in the release workflow.
ARG NODE_IMAGE=node:22-trixie-slim@sha256:68c76cfad89921b927eae28ba21407475e29d0ce450afcdbe70c1532db042b64
FROM ${NODE_IMAGE} AS workspace
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

FROM workspace AS source
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .

FROM workspace AS production-dependencies
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

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
COPY --chown=1000:1000 infra/healthcheck.mjs infra/healthcheck.mjs
USER 1000:1000

FROM runtime AS web
COPY --from=build-web --chown=1000:1000 /app/apps/web/.next/standalone /app
COPY --from=build-web --chown=1000:1000 /app/apps/web/.next/static /app/apps/web/.next/static
COPY --chown=1000:1000 apps/web/public /app/apps/web/public
WORKDIR /app/apps/web
ENV HOSTNAME=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]

FROM runtime AS admin
LABEL org.stella.admin-ui="dashboard"
COPY --from=build-admin --chown=1000:1000 /app/apps/admin/.next/standalone /app
COPY --from=build-admin --chown=1000:1000 /app/apps/admin/.next/static /app/apps/admin/.next/static
COPY --chown=1000:1000 apps/admin/public /app/apps/admin/public
WORKDIR /app/apps/admin
ENV HOSTNAME=0.0.0.0 PORT=3001
EXPOSE 3001
CMD ["node", "server.js"]

FROM runtime AS api-system
USER root
RUN apt-get -o Acquire::Retries=3 update \
    && apt-get -o Acquire::Retries=3 install -y --no-install-recommends ca-certificates \
    && sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get -o Acquire::Retries=3 update \
    && apt-get -o Acquire::Retries=3 install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
USER 1000:1000

FROM api-system AS api
COPY --from=production-dependencies --chown=1000:1000 /app /app
COPY --chown=1000:1000 apps/api/src /app/apps/api/src
COPY --chown=1000:1000 apps/web/messages /app/apps/web/messages
COPY --chown=1000:1000 packages/shared/src /app/packages/shared/src
COPY --chown=1000:1000 packages/db/src /app/packages/db/src
COPY --chown=1000:1000 packages/db/drizzle /app/packages/db/drizzle
COPY --chown=1000:1000 data/catalog.json data/privacy-draft.json /app/data/
COPY --chown=1000:1000 data/i18n/core-source.json data/i18n/core-content.json /app/data/i18n/
COPY --chown=1000:1000 data/journeys /app/data/journeys
COPY --chown=1000:1000 assets/journeys /app/assets/journeys
COPY --chown=1000:1000 assets/images/stock/sphinx.jpg assets/images/stock/sharm-bay.jpg /app/assets/images/stock/
COPY --chown=1000:1000 assets/video-stock/stock-giza-pyramids-aerial.mp4 /app/assets/video-stock/
COPY --chown=1000:1000 scripts/migrate.ts scripts/seed.ts scripts/seed-trip-stories.ts /app/scripts/
ENV HOST=0.0.0.0 PORT=4000
EXPOSE 4000
CMD ["node", "--import", "tsx", "apps/api/src/server.ts"]
