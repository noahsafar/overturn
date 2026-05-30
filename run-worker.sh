#!/bin/bash
set -e
cd "$(dirname "$0")/apps/worker"
unset DATABASE_URL
set -a
source ../../.env
set +a
exec env PYTHONPATH="$(pwd)/src" .venv/bin/python -u -m overturn_worker.dev
