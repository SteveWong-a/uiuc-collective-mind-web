#!/bin/bash
# Supervisor used by the LaunchAgent: keeps the server running, restarting it a few
# seconds after any exit (crash or otherwise). Stop it with scripts/uninstall-launchagent.sh.
cd "$(dirname "$0")/.."
export UCM_NO_OPEN=1
while true; do
  node server.mjs
  echo "$(date -u +%FT%TZ) server exited with code $?, restarting in 5s"
  sleep 5
done
