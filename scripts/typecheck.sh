#!/bin/sh
# Type-check the given handler files (or all, with no arguments) against the AWS SDK v3 types.
set -e
cd "$(dirname "$0")/.."
if [ $# -eq 0 ]; then exec npx tsc -p tsconfig.json; fi
files=$(printf '"%s",' lib/handler.ts "$@"); tmp=$(mktemp ./.tsconfig.XXXXXX)
echo "{\"extends\": \"./tsconfig.json\", \"include\": [], \"files\": [${files%,}]}" > "$tmp"
rc=0; npx tsc -p "$tmp" || rc=$?; rm -f "$tmp"; exit $rc
