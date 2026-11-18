# Architecture

## Runtime shape (single deployable)

```
Browser ── HTTPS/WSS ── Node process (Express + Socket.IO)
   │  REST: /api/*  /mvfiles/*
   │  WS:   gateway events (chat, stages, rtc, games)
   └─ WebRTC P2P mesh (voice/video/screen) — media never touches the server
        └─ STUN: public Google servers (TURN: optional, see WEBRTC_SETUP.md)
Storage: FileStore (JSON, dev/codespace)  or  PostgreSQL (DATABASE_URL) — same interface
Files:   ./data/mv/<ROOM>/<file> (movie uploads, wiped on eject/close)
```

## Stack decision vs. the brief

The brief recommended React/TS/NestJS/Prisma/Redis/SFU/Docker. This repo deliberately ships **Node + Express + Socket.IO + one-file vanilla web client + pluggable File/Postgres store** instead:

1. **Deployment reality**: the platform runs on a GitHub Codespace container — no Docker daemon, no managed Postgres/Redis, no k8s. A build-step React app and a Postgres-backed Prisma service could not be *run and verified* here; this stack is fully running and tested live.
2. **Operability**: one process, one static file, zero build step — deploys are `git pull + restart`, verified end-to-end.
3. **Same interfaces, different internals**: `store.js` already swaps File→PostgreSQL by env var; the WS event catalog and REST API are documented so a React/NestJS/Prisma rewrite can proceed per milestone without protocol changes.
4. The migration path (React front-end, Prisma schema, Redis adapter, SFU) is specified in `DEVELOPMENT_ROADMAP.md` with rationale for each step.

## Module map

| Module | Responsibility |
|---|---|
| `server/index.js` | HTTP entry, static serving (HTML `no-store`), REST mount, movie routes, Socket.IO config, graceful shutdown |
| `server/gateway.js` | All WS events; per-room in-memory state; persistence of chat/strokes/state (3s dirty-flush); presence; bans; rate limits |
| `server/rooms.js` | REST: health, lobby list, create/get room |
| `server/store.js` | `createRoom/getRoom/closeRoom`, messages, strokes, KV `room_state` — two backends, one interface |
| `server/mvfiles.js` | Upload tokens (16-byte random, 2h TTL), sequential 8 MB chunk append, Range-capable file serving is in index.js via express `sendFile` |
| `server/guard.js` | URL allow-list (http/https), control-char strip, length clamps, unambiguous room codes, SHA-256 |
| `server/limits.js` | Token-bucket per socket/event (sweeps every 2 min) |
| `web/index.html` | Entire client: CSS (themes, responsive), i18n FA/EN, stage UIs, WebRTC mesh client, game UIs |

## Real-time model

- **Server-authoritative**: room membership, game rules (tt/rps), theme, kick/ban, controller lock. Clients never trust each other; every event re-validated against the room's live member map.
- **Symmetric media sync**: no "leader" — every playing member broadcasts 2.5s heartbeats; each member jumps if >2s from others' reports; server suppresses stale heartbeats for 3s after a seek (`lastSeekBy/lastSeekAt`) to prevent position tug-of-war.
- **Ephemeral vs durable**: call presence, cursors, typing → memory only. Chat, strokes, yt/mv/tt/rps/theme/cov → persisted via dirty-set flush.
- **Reconnect**: socket.io auto-reconnect → client re-emits `join`; server snapshot (last 100 chat, strokes, all stage states, call roster) re-hydrates the page; an in-call client re-emits `rtc.join`.

## Scaling path (when needed)
1. `socket.io-redis` adapter + sticky sessions → multiple Node replicas (gateway already holds all mutable room state in one map; Redis adapter handles cross-node broadcast).
2. Media: replace mesh with LiveKit/mediasoup SFU behind the same `rtc.*` client API (tiles/tray UI unchanged).
3. Postgres is already wired; add PgBouncer + read replicas for chat history.
