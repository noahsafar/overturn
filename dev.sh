#!/usr/bin/env bash
# One-command dev boot:
#   - Postgres (pgvector) in Docker on :5433
#   - Temporal dev server in Docker on :7233 (UI on :8233)
#   - Prisma migrate (so schema changes apply automatically)
#   - Worker (FastAPI + Temporal worker + clearinghouse poller) on :8001
#   - Web (Next.js) on :3000
#
# Containers persist between runs (named overturn-pg, overturn-temporal) so
# data sticks around. Ctrl+C stops the worker + web; the containers keep
# running in the background (run `./dev.sh stop` to shut them down).

set -euo pipefail

cd "$(dirname "$0")"

# ── Args ─────────────────────────────────────────────────────────────────────
case "${1:-up}" in
  stop)
    echo "Stopping Docker containers…"
    docker stop overturn-pg overturn-temporal 2>/dev/null || true
    exit 0
    ;;
  nuke)
    echo "Removing Docker containers + volumes (will delete all dev data)…"
    docker rm -f overturn-pg overturn-temporal 2>/dev/null || true
    docker volume rm overturn-pg-data 2>/dev/null || true
    exit 0
    ;;
  up) ;;
  *)
    echo "usage: ./dev.sh [up|stop|nuke]" >&2
    exit 1
    ;;
esac

# ── Config ───────────────────────────────────────────────────────────────────
PG_CONTAINER=overturn-pg
PG_VOLUME=overturn-pg-data
PG_IMAGE=pgvector/pgvector:pg16
PG_PORT=5433

TEMPORAL_CONTAINER=overturn-temporal
TEMPORAL_IMAGE=temporalio/admin-tools:1.25
TEMPORAL_PORT=7233
TEMPORAL_UI_PORT=8233

LOG_DIR=".logs"
mkdir -p "$LOG_DIR"

# ── Pre-flight ───────────────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  echo "✗ Docker is required. Install Docker Desktop and try again." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "✗ Docker is installed but not running. Start Docker Desktop and try again." >&2
  exit 1
fi
if ! command -v pnpm >/dev/null 2>&1; then
  echo "✗ pnpm not found. Install via 'corepack enable && corepack prepare pnpm@9 --activate'." >&2
  exit 1
fi
if ! command -v uv >/dev/null 2>&1; then
  echo "✗ uv not found. Install via 'curl -LsSf https://astral.sh/uv/install.sh | sh'." >&2
  exit 1
fi
if [[ ! -f .env ]]; then
  echo "✗ .env file missing — copy .env.example to .env first." >&2
  exit 1
fi

# Source .env into THIS shell so child processes (prisma db push, seed,
# worker, web) all see the same PHI_ENC_KEY + DATABASE_URL etc. Without
# this, the seed step encrypts Patient PHI with the dev fallback key
# (all-7s) while the web app reads the real key → AES-GCM auth tag
# mismatch on every decrypt.
set -a
# shellcheck disable=SC1091
source .env
set +a

echo "▸ Starting Postgres ($PG_IMAGE on :$PG_PORT)…"
if docker container inspect $PG_CONTAINER >/dev/null 2>&1; then
  docker start $PG_CONTAINER >/dev/null
else
  docker run -d --name $PG_CONTAINER \
    -e POSTGRES_USER=overturn \
    -e POSTGRES_PASSWORD=overturn \
    -e POSTGRES_DB=overturn \
    -p ${PG_PORT}:5432 \
    -v ${PG_VOLUME}:/var/lib/postgresql/data \
    $PG_IMAGE >/dev/null
fi

echo "▸ Starting Temporal dev server ($TEMPORAL_IMAGE on :$TEMPORAL_PORT, UI on :$TEMPORAL_UI_PORT)…"
# The admin-tools image has ENTRYPOINT `tini -- sleep infinity` baked in,
# so any CMD args we pass get eaten. We override the entrypoint to the
# `temporal` CLI directly. If a previously-created container has the wrong
# entrypoint baked in, recreate it.
needs_recreate=false
if docker container inspect $TEMPORAL_CONTAINER >/dev/null 2>&1; then
  current_ep=$(docker container inspect $TEMPORAL_CONTAINER \
    --format '{{join .Config.Entrypoint " "}}' 2>/dev/null || echo "")
  if [[ "$current_ep" != "temporal" ]]; then
    needs_recreate=true
    echo "  (existing container has wrong entrypoint — recreating)"
    docker rm -f $TEMPORAL_CONTAINER >/dev/null
  fi
fi
if docker container inspect $TEMPORAL_CONTAINER >/dev/null 2>&1; then
  docker start $TEMPORAL_CONTAINER >/dev/null
else
  docker run -d --name $TEMPORAL_CONTAINER \
    --entrypoint temporal \
    -p ${TEMPORAL_PORT}:7233 \
    -p ${TEMPORAL_UI_PORT}:8233 \
    $TEMPORAL_IMAGE \
    server start-dev --ip 0.0.0.0 --db-filename /tmp/temporal.db >/dev/null
fi

# ── Wait for health ──────────────────────────────────────────────────────────
echo -n "▸ Waiting for Postgres"
for i in {1..40}; do
  if docker exec $PG_CONTAINER pg_isready -U overturn -d overturn >/dev/null 2>&1; then
    echo " ✓"
    break
  fi
  echo -n "."
  sleep 0.5
  if [[ $i -eq 40 ]]; then
    echo " ✗ timed out" >&2
    docker logs --tail 30 $PG_CONTAINER >&2
    exit 1
  fi
done

echo -n "▸ Waiting for Temporal"
# `start-dev` opens the TCP port before the gRPC service is actually ready
# to answer SDK calls — a bare TCP check returns ConnectionReset against
# the SDK. Use the `temporal` CLI inside the container to verify the
# cluster is genuinely up (exits 0 only when gRPC system info responds).
for i in {1..120}; do
  if docker exec $TEMPORAL_CONTAINER \
       temporal operator cluster system --address localhost:7233 \
       >/dev/null 2>&1; then
    echo " ✓"
    break
  fi
  echo -n "."
  sleep 1
  if [[ $i -eq 120 ]]; then
    echo " ✗ timed out" >&2
    docker logs --tail 30 $TEMPORAL_CONTAINER >&2
    exit 1
  fi
done

# ── Install / sync deps if missing ───────────────────────────────────────────
if [[ ! -d node_modules ]] || [[ ! -d node_modules/.pnpm ]]; then
  echo "▸ Installing JS deps…"
  pnpm install
fi
if [[ ! -d apps/worker/.venv ]]; then
  echo "▸ Creating Python venv + installing worker deps…"
  (cd apps/worker && uv venv && uv pip install -e .)
fi

# ── Apply schema ─────────────────────────────────────────────────────────────
echo "▸ Applying Prisma schema (db push)…"
# Use `db push` instead of `migrate dev` so we don't require a migrations/
# directory or prompt for a migration name. Safe for dev — never run this
# against prod.
pnpm --filter @overturn/db exec prisma db push --skip-generate --accept-data-loss \
  > "$LOG_DIR/migrate.log" 2>&1 || {
    echo "✗ schema sync failed — see $LOG_DIR/migrate.log" >&2
    tail -20 "$LOG_DIR/migrate.log" >&2
    exit 1
  }
pnpm --filter @overturn/db exec prisma generate > /dev/null 2>&1

# Seed if the database is empty (no Practice rows).
if docker exec $PG_CONTAINER psql -U overturn -d overturn -tAc \
   'SELECT count(*) FROM "Practice"' 2>/dev/null | grep -q '^0$'; then
  echo "▸ Seeding dev data…"
  pnpm --filter @overturn/db seed > "$LOG_DIR/seed.log" 2>&1 || {
    echo "  (seed failed; see $LOG_DIR/seed.log — continuing)" >&2
  }
fi

# ── Start worker + web ───────────────────────────────────────────────────────
WORKER_PID=""

cleanup() {
  echo ""
  echo "▸ Stopping worker…"
  if [[ -n "$WORKER_PID" ]] && kill -0 "$WORKER_PID" 2>/dev/null; then
    kill "$WORKER_PID" 2>/dev/null || true
    # Give it a moment to shut down gracefully.
    for _ in {1..10}; do
      if ! kill -0 "$WORKER_PID" 2>/dev/null; then break; fi
      sleep 0.2
    done
    kill -9 "$WORKER_PID" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
  echo "▸ Done. Docker containers left running — './dev.sh stop' to halt them."
}
trap cleanup EXIT INT TERM

echo "▸ Starting worker (logs: $LOG_DIR/worker.log)…"
./run-worker.sh > "$LOG_DIR/worker.log" 2>&1 &
WORKER_PID=$!

# Wait for FastAPI healthz to come up.
echo -n "▸ Waiting for worker"
for i in {1..60}; do
  if curl -fsS http://localhost:8001/healthz >/dev/null 2>&1; then
    echo " ✓"
    break
  fi
  if ! kill -0 "$WORKER_PID" 2>/dev/null; then
    echo " ✗ worker died — see $LOG_DIR/worker.log" >&2
    tail -30 "$LOG_DIR/worker.log" >&2
    exit 1
  fi
  echo -n "."
  sleep 0.5
  if [[ $i -eq 60 ]]; then
    echo " ✗ timed out" >&2
    tail -30 "$LOG_DIR/worker.log" >&2
    exit 1
  fi
done

echo "▸ Starting web on http://localhost:3000 (foreground)…"
echo "  Temporal UI:  http://localhost:8233"
echo "  Worker logs:  tail -f $LOG_DIR/worker.log"
echo "  Press Ctrl+C to stop everything."
echo ""

# Web in foreground so its compile output is visible. The EXIT trap above
# tears down the worker when this process ends (either via Ctrl+C or a web
# crash). If the web crashes, we tail the worker log too so the user has
# all the context they need.
if ! ./run-web.sh; then
  echo ""
  echo "✗ web exited non-zero. Last 30 lines of worker log:" >&2
  tail -30 "$LOG_DIR/worker.log" >&2
fi
