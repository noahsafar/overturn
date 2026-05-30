#!/bin/bash
set -e
cd "$(dirname "$0")/apps/web"
unset DATABASE_URL
set -a
source ../../.env
set +a
exec env PATH="/opt/homebrew/opt/node@20/bin:$PATH" NEXT_TELEMETRY_DISABLED=1 pnpm dev
