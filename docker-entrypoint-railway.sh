#!/bin/sh
set -e

# Fix Railway volume permissions: volumes mount as root-owned,
# but the app needs to write as the 'node' user (uid 1000).
if [ -d /data ] && [ "$(id -u)" = "0" ]; then
  mkdir -p /data/.openclaw /data/workspace
  chown -R node:node /data
fi

# Seed initial OpenClaw config if it doesn't exist.
# - Disables device pairing for the Control UI (required for cloud deployments
#   where there's no local terminal to approve the initial pairing).
# - Trusts Railway's internal proxy so client IPs resolve correctly.
CONFIG_FILE="/data/.openclaw/openclaw.json"
if [ ! -f "$CONFIG_FILE" ]; then
  cat > "$CONFIG_FILE" << 'SEED_CONFIG'
{
  "gateway": {
    "controlUi": {
      "dangerouslyDisableDeviceAuth": true
    },
    "trustedProxies": ["100.64.0.0/10", "10.0.0.0/8", "172.16.0.0/12"]
  }
}
SEED_CONFIG
  chown node:node "$CONFIG_FILE"
fi

# Drop to node user and exec the CMD
exec su -s /bin/sh node -c "exec $*"
