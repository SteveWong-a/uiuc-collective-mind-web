#!/bin/bash
set -e

echo "==> Downloading UIUC Collective Mind for macOS..."
URL="https://github.com/SteveWong-a/uiuc-collective-mind-web/releases/latest/download/UIUC.Collective.Mind-0.1.0-arm64.dmg"
TMP_DMG="/tmp/UIUC.Collective.Mind.dmg"
MOUNT_DIR="/tmp/uiuc_mnt"

curl -L -f -s -S "$URL" -o "$TMP_DMG"

echo "==> Installing to /Applications..."
mkdir -p "$MOUNT_DIR"
hdiutil attach "$TMP_DMG" -nobrowse -quiet -mountpoint "$MOUNT_DIR"
rm -rf "/Applications/UIUC Collective Mind.app"
cp -R "$MOUNT_DIR/UIUC Collective Mind.app" "/Applications/"
hdiutil detach "$MOUNT_DIR" -quiet || true
rm -rf "$MOUNT_DIR" "$TMP_DMG"

# Leave Gatekeeper quarantine in place. Prefer a notarized build and the usual
# right-click → Open (or System Settings → Privacy & Security → Open Anyway).

echo "==> Successfully installed UIUC Collective Mind!"
open "/Applications/UIUC Collective Mind.app"
