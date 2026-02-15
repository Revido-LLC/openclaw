# OpenClaw — Revido Railway Deployment

This is the Revido fork of OpenClaw, deployed on Railway at `assistant.revido.co`.

## Architecture

```
User Browser (HTTPS) --> Railway Reverse Proxy --> OpenClaw Gateway (ws://0.0.0.0:18789)
                                                         |
                                                    /data volume (persistent)
                                                    ├── .openclaw/openclaw.json (config)
                                                    ├── .openclaw/devices/ (paired devices)
                                                    └── workspace/
```

## Railway Deployment

### Live URLs

| Endpoint               | URL                                           |
| ---------------------- | --------------------------------------------- |
| Dashboard / Control UI | `https://assistant.revido.co/health/overview` |
| Chat                   | `https://assistant.revido.co/health/chat`     |
| Health check           | `https://assistant.revido.co/health`          |
| Backup export          | `https://assistant.revido.co/health/export`   |

### Railway Project

- **Project:** OpenClaw Revido
- **Service:** openclaw
- **Environment:** production
- **Volume:** mounted at `/data`
- **Custom domain:** `assistant.revido.co` (port 18789)

### Key Environment Variables

| Variable                    | Purpose                                                      |
| --------------------------- | ------------------------------------------------------------ |
| `OPENCLAW_GATEWAY_TOKEN`    | Auth token for WebSocket connections (enter in Control UI)   |
| `OPENCLAW_STATE_DIR`        | `/data/.openclaw` — persisted config/state                   |
| `OPENCLAW_WORKSPACE_DIR`    | `/data/workspace` — agent workspace                          |
| `OPENCLAW_PRIMARY_MODEL`    | `claude-sonnet-4-5-20250929`                                 |
| `ANTHROPIC_API_KEY`         | Anthropic API key                                            |
| `OPENCLAW_GATEWAY_PASSWORD` | Shared secret — gateway password auth (alternative to token) |
| `PORT`                      | `18789` — must match Railway networking config               |

### Railway-Specific Files (our additions)

These files exist only in our fork for Railway deployment:

- **`Dockerfile.railway`** — Extends the upstream Dockerfile with:
  - Custom entrypoint for volume permission fixing
  - `--bind lan` to listen on 0.0.0.0 (required for Railway's reverse proxy)
  - `--port 18789` hardcoded in CMD
  - No `USER node` restriction at runtime (entrypoint runs as root, then drops to node)

- **`docker-entrypoint-railway.sh`** — Runs before the gateway:
  1. Fixes `/data` volume ownership (Railway volumes mount as root)
  2. Seeds `openclaw.json` config on first boot (disables device pairing, trusts Railway proxies)
  3. Drops privileges to `node` user via `su`

- **`railway.toml`** — Railway service configuration:
  - Points to `Dockerfile.railway`
  - Health check at `/health` with 300s timeout
  - Restart policy: ON_FAILURE with 10 retries

- **`.railwayignore`** — Controls what `railway up` uploads:
  - Mirrors `.gitignore` but KEEPS `pnpm-lock.yaml` (required by Dockerfile, but gitignored upstream)
  - Excludes `CLAUDE.md` symlinks (Railway indexer can't follow them)

### Deployment Commands

```bash
# Deploy from repo directory
cd /Users/rodrig/Documents/GitHub/openclaw
railway up --detach

# Check status
railway service status --json

# View logs
railway logs --tail 50

# SSH into running container
railway ssh

# Restart service
railway service restart --yes

# Check/set variables
railway variables
railway variable set "KEY=VALUE"
```

### Known Quirks

1. **`pnpm-lock.yaml` is gitignored** — Upstream intentionally gitignores it. The `.railwayignore` file handles this for Railway uploads. Never use `railway up --no-gitignore` (uploads node_modules, causes timeouts).

2. **Symlinks break `railway up`** — `CLAUDE.md` files are symlinks to `AGENTS.md`. The `.railwayignore` excludes them.

3. **Volume permissions** — Railway volumes are root-owned. `docker-entrypoint-railway.sh` runs `chown` before dropping to `node` user. If you see `EACCES` errors on `/data`, the entrypoint isn't running properly.

4. **Device pairing disabled** — `openclaw.json` sets `dangerouslyDisableDeviceAuth: true`. This is required for cloud deployments where there's no local terminal to approve the first pairing. Auth is still enforced via gateway token over HTTPS.

5. **Trusted proxies** — Railway routes through `100.64.x.x` (CGNAT). Config includes `100.64.0.0/10`, `10.0.0.0/8`, `172.16.0.0/12` as trusted. Without this, the gateway logs "Proxy headers detected from untrusted address" and can't resolve real client IPs.

6. **Config lives on the volume** — `/data/.openclaw/openclaw.json` persists across deploys. To reset config, SSH in and delete it; the entrypoint will re-seed on next restart.

### Upstream Sync

```bash
git fetch upstream
git merge upstream/main
git push origin main
# Railway auto-deploys if connected via GitHub, or run: railway up --detach
```

When syncing, watch for changes to the upstream `Dockerfile` — if it changes, update `Dockerfile.railway` to match (it's a copy with Railway-specific modifications).

## Gateway Auth Flow

The Control UI (browser) connects to the gateway via WebSocket:

1. Browser opens `wss://assistant.revido.co`
2. Sends `connect` frame with `auth.token` = `OPENCLAW_GATEWAY_TOKEN`
3. Gateway verifies token
4. With `dangerouslyDisableDeviceAuth: true`, device pairing is skipped
5. Connection established, Control UI is live

If token is wrong/missing: `disconnected (1008): unauthorized: gateway token mismatch`
If pairing required: means `dangerouslyDisableDeviceAuth` is not set in config
