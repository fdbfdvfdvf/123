# Together — Kosmi-inspired social hangout platform

A real-time, browser-only hangout platform in the spirit of [kosmi.io](https://kosmi.io): persistent rooms, synced watch parties, voice/video calls, screen sharing with system audio, shared whiteboard & co-browsing, multiplayer games, and a public lobby — **no sign-up required**.

> This is an independent implementation. It does not use, copy, or claim knowledge of Kosmi's proprietary source code, private APIs, or internal infrastructure. Feature observations were made only from Kosmi's public website (see `docs/research/KOSMI_ANALYSIS.md`).

**Live instance:** the user's GitHub Codespace (`deploy/` scripts) — same code runs anywhere Node runs.

## Feature matrix (implemented = real, tested code)

| Area | Features |
|---|---|
| Rooms | Create (name + optional password), join by code / invite link `#r=CODE`, public lobby of live rooms, host role, controller lock, kick + temporary ban, 12-person cap, room themes (Classic/Coffee shop/Pub/Drive-in/Arcade), persistent room state |
| People | Guest identity by nickname (no registration), roster with call badges, reconnection re-join |
| Chat | Persisted history (≤2000), typing indicator, quick reactions, system messages |
| Watch party | YouTube (URL/ID, play/pause/seek/rate, 8s heartbeat), shared movie upload (chunked ≤2 GB, Range streaming, symmetric 2.5s heartbeats with anti-rollback, host/uploader eject) |
| Voice / video | WebRTC mesh calls (audio + optional camera), speaking indicator (local analysis), per-tile volume, unmute-all, device-driven tiles |
| Screen share | `getDisplayMedia` with **mixed system+mic audio** (WebAudio), instant switch back to camera, badge + wide tile |
| Games | Tic-tac-toe (server-validated turns, sides, scores) and Rock-Paper-Scissors (hidden picks until both choose, server-validated, persistent wins) |
| Board & co-view | Shared whiteboard (pen/eraser/width/undo/clear/PNG export, persisted strokes, remote cursors), synced iframe co-browsing (URL stack, zoom, reload) |
| i18n / UX | Full Persian + English, RTL/LTR, dark theme, responsive (mobile drawer chat, wrapped tabs), toasts, empty states |

## Quick start

```bash
npm install
npm start            # http://localhost:3121
```

Environment variables: see `docs/INSTALLATION.md`. Tests: see `docs/DEVELOPMENT_ROADMAP.md` and `test/`.

## Layout

```
server/   index.js (HTTP+WS entry), gateway.js (socket events), rooms.js (REST),
          store.js (File/PostgreSQL), mvfiles.js (chunked upload), guard.js, limits.js
web/      index.html (single-file UI: CSS + JS, i18n, WebRTC client)
test/     smoke.js, features.js (socket harness: lobby/theme/RPS/call presence)
deploy/   restart.sh, codespace-up.sh, gh-codespace-deploy.sh, compose file
docs/     research/ + architecture, database, API, WS events, WebRTC, security, deployment, roadmap
```

## Documentation

- `docs/research/KOSMI_ANALYSIS.md` — public-product analysis, verified vs. assumed
- `docs/research/PRODUCT_SPEC.md` — product specification for this platform
- `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/API_DOCUMENTATION.md`, `docs/WEBSOCKET_EVENTS.md`, `docs/WEBRTC_SETUP.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/INSTALLATION.md`, `docs/DEVELOPMENT_ROADMAP.md`

## Status

48 automated checks pass on the live deployment (12 WebRTC two-browser × 2 role orders, 20 movie sync, 16 feature harness). Known limits and the next milestones are in `docs/DEVELOPMENT_ROADMAP.md`.
