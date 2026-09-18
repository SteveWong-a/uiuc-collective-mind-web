#!/bin/bash
# Remove the port-80 forwarder. No sudo for the per-user agent; run with sudo only
# if an older root LaunchDaemon or packet-filter redirect is still present.
set -euo pipefail
LABEL=com.uiuc-collective-mind.port80
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
if [ "$(id -u)" = 0 ]; then
  launchctl bootout system/$LABEL 2>/dev/null || true
  rm -f /Library/LaunchDaemons/$LABEL.plist
  if grep -q 'uiuc-collective-mind' /etc/pf.conf 2>/dev/null; then
    sed -i '' '/uiuc-collective-mind/d' /etc/pf.conf; rm -f /etc/pf.anchors/uiuc-collective-mind
    pfctl -f /etc/pf.conf 2>/dev/null || true; pfctl -d 2>/dev/null || true
  fi
elif [ -f /Library/LaunchDaemons/$LABEL.plist ] || grep -q 'uiuc-collective-mind' /etc/pf.conf 2>/dev/null; then
  echo "An older root install remains; run: sudo bash scripts/uninstall-port80.sh" >&2
fi
echo "Removed $LABEL"
