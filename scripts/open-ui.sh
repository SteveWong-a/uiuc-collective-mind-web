#!/bin/bash
# Open the local UI with this install's API token. The LaunchAgent starts the
# server without a browser tab; after this sets the HttpOnly cookie once,
# bookmarks of http://course.localhost:4258 work in that browser.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN_FILE="$ROOT/data/api-token"
if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "No $TOKEN_FILE yet. Start the server once (npm start) so it can create the token." >&2
  exit 1
fi
TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
HOST=course.localhost
PORT=4258
if [[ -f "$ROOT/settings.json" ]]; then
  HOST="$(node --input-type=module -e "import { loadSettings } from 'file://${ROOT}/lib/settings.mjs'; process.stdout.write(loadSettings('${ROOT}/settings.json').appHost)")"
  PORT="$(node --input-type=module -e "import { loadSettings } from 'file://${ROOT}/lib/settings.mjs'; process.stdout.write(String(loadSettings('${ROOT}/settings.json').port))")"
fi
URL="http://${HOST}:${PORT}/?t=${TOKEN}"
if command -v open >/dev/null; then
  open "$URL"
elif command -v xdg-open >/dev/null; then
  xdg-open "$URL"
else
  echo "$URL"
fi
