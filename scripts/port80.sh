#!/bin/bash
# One-time setup, no sudo: reach the app at http://course.localhost without a port.
# Installs a per-user LaunchAgent that forwards port 80 -> 127.0.0.1:<app port>
# (loopback clients only). Undo with scripts/uninstall-port80.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${1:-4258}"
NODE="$(command -v node)"
LABEL=com.uiuc-collective-mind.port80
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ -f "/Library/LaunchDaemons/$LABEL.plist" ]; then
  echo "An older root version is installed; remove it first: sudo bash scripts/uninstall-port80.sh" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$ROOT/logs"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$NODE</string><string>$ROOT/scripts/port80-proxy.mjs</string><string>80</string><string>$PORT</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$ROOT/logs/port80.log</string>
  <key>StandardErrorPath</key><string>$ROOT/logs/port80.log</string>
</dict>
</plist>
PLIST
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl kickstart -k "gui/$(id -u)/$LABEL"
echo "Forwarding port 80 -> 127.0.0.1:$PORT. Open http://course.localhost"
