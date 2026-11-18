# Deployment

## Current production deployment (GitHub Codespace)
The live instance runs in the user's Codespace (`fdbfdvfdvf/123`, branch `together-codespace`):

1. **Push**: `git push origin together-codespace` (token via `GH_TOKEN` env).
2. **Update inside**: `gh codespace ssh -c <name> -- 'cd /workspaces/123 && git pull --ff-only origin together-codespace && bash deploy/restart.sh'` — restart.sh kills the old node process, `npm ci`-safe, starts with `nohup` on port 3000, then curls `/api/health` and prints the result.
3. **Public URL**: `https://<codespace-name>-3000.app.github.dev` (port 3000 set public via `gh codespace ports visibility 3000:public`). First-time visitors see GitHub's own trust interstitial → Continue.
4. **Wake after idle stop** (30-min default): one command from the agent sandbox:
   `GH_TOKEN=… bash scripts/up.sh` — starts the codespace, re-makes the port public, pulls, restarts, verifies health. It self-heals missing CLI tools (`scripts/setup_tools.sh`).

## Environment variables
| Var | Required | Meaning |
|---|---|---|
| `PORT` | no (default 3121; codespace uses 3000) | HTTP/WS port |
| `DATA_DIR` | no (default `.`) | JSON store + `mv/` movie files root |
| `DATABASE_URL` | no | When set, switches store to PostgreSQL (schema auto-created; `name` column auto-migrated) |
| `LOG_EVENTS` | no | Verbose event log to stdout (debugging) |

No other secrets exist today. Client code contains zero credentials by design.

## Self-host with Docker

```bash
docker build -t together .
docker run -p 3121:3121 -v together-data:/app/data -e PORT=3121 together
# behind nginx: proxy_pass http://127.0.0.1:3121;  upgrade headers for WS:
#   proxy_http_version 1.1;
#   proxy_set_header Upgrade $http_upgrade;
#   proxy_set_header Connection "upgrade";
```
`deploy/compose.codespace.yaml` shows the compose variant used on the Codespace. Put nginx/Caddy in front for TLS + gzip at the edge if not using Codespaces.

## Health & monitoring
- `GET /api/health` → liveness + storage backend + live room count; wired into the wake script.
- Server logs: startup line (`storage:` backend), graceful shutdown (`SIGTERM` → `io.close` → `server.close` with 8 s grace), warnings for persist failures.
- *Planned* (M11): `/api/admin/stats` + uptime monitor integration.

## Update checklist (no-regression protocol used in this repo)
1. `node --check` all server files + extract & syntax-check inline client JS.
2. Local boot (`PORT=3199 node server/index.js`) + curl health/lobby.
3. Push → deploy → curl served markers for the new feature.
4. Run all three suites on the **live** server: `test/smoke.js`, `test/features.js`, movie e2e + WebRTC two-browser (see `DEVELOPMENT_ROADMAP.md`).
