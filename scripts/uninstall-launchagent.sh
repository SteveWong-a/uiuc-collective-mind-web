#!/bin/bash
set -euo pipefail
LABEL=com.uiuc-collective-mind
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
echo "Removed $LABEL"
