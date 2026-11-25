#!/bin/sh
# Container bootstrap: migrate -> seed (first boot only) -> judges' account -> start.
set -e
cd /app

# Platform volumes are usually mounted root-owned: fix ownership, then re-exec as "node".
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$(dirname "${DATABASE_PATH:-/data/firstrecord.db}")" "${STORAGE_DIR:-/data/storage}"
  chown -R node:node "$(dirname "${DATABASE_PATH:-/data/firstrecord.db}")" "${STORAGE_DIR:-/data/storage}"
  exec setpriv --reuid=node --regid=node --init-groups "$0" "$@"
fi

TSX="node_modules/.bin/tsx --conditions=react-server"

mkdir -p "$(dirname "${DATABASE_PATH:-/data/firstrecord.db}")" "${STORAGE_DIR:-/data/storage}"

# Public origin for CSRF origin checks: explicit APP_ORIGIN wins, else the host's own URL.
if [ -z "$APP_ORIGIN" ]; then
  if [ -n "$RAILWAY_PUBLIC_DOMAIN" ]; then export APP_ORIGIN="https://$RAILWAY_PUBLIC_DOMAIN";
  elif [ -n "$RENDER_EXTERNAL_URL" ]; then export APP_ORIGIN="$RENDER_EXTERNAL_URL";
  fi
fi
[ -n "$APP_ORIGIN" ] && echo "[boot] APP_ORIGIN=$APP_ORIGIN" || echo "[boot] WARNING: APP_ORIGIN is not set"

echo "[boot] running migrations"
$TSX scripts/migrate.ts

# seed.ts is idempotent: it does nothing when the database is already seeded, and
# only adds fictional demo users/content when DEMO_MODE=true.
echo "[boot] seeding (first boot only)"
$TSX scripts/seed.ts

if [ -n "$JUDGE_EMAIL" ] && [ -n "$JUDGE_PASSWORD" ]; then
  echo "[boot] ensuring judges' account $JUDGE_EMAIL"
  set -- --email "$JUDGE_EMAIL" --name "${JUDGE_NAME:-Hackathon Judges}" --role "${JUDGE_ROLE:-station_admin}" --no-force-change
  [ -n "${JUDGE_STATION:-CNT}" ] && set -- "$@" --station "${JUDGE_STATION:-CNT}"
  if ! FR_NEW_PASSWORD="$JUDGE_PASSWORD" $TSX scripts/create-user.ts "$@"; then
    echo "[boot] judges' account not created (it may already exist; see message above)"
  fi
fi

echo "[boot] starting server on port ${PORT:-3000}"
exec node_modules/.bin/next start -H "${HOSTNAME:-0.0.0.0}" -p "${PORT:-3000}"
