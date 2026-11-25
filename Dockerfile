# FirstRecord — production container.
# Debian slim (not Alpine) so native prebuilt binaries (onnxruntime-node, sharp)
# pulled in by @huggingface/transformers install cleanly. node:sqlite needs >= 22.13.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
# Full install: the runtime bootstrap (migrate/seed/create-user) runs TypeScript via tsx.
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time placeholders only; real values are injected at runtime.
RUN DEMO_MODE=true DATABASE_PATH=/tmp/build.db STORAGE_DIR=/tmp/build-storage npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_PATH=/data/firstrecord.db \
    STORAGE_DIR=/data/storage
RUN apt-get update && apt-get install -y --no-install-recommends tini ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data/storage && chown -R node:node /data
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json /app/tsconfig.json /app/next.config.ts ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/scripts ./scripts
# Starts as root only to fix ownership of the mounted /data volume, then drops to
# the unprivileged "node" user (see scripts/docker-entrypoint.sh).
RUN chmod +x scripts/docker-entrypoint.sh
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "/app/scripts/docker-entrypoint.sh"]
