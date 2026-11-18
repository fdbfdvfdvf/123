# Installation

## Requirements
- Node.js ≥ 18 (tested on Node 22), npm
- No database required by default (JSON file store). PostgreSQL 12+ optional.
- Browsers: Chromium ≥ 96 / Firefox ≥ 90 / Safari ≥ 15 (getUserMedia + replaceTrack).

## Local run
```bash
git clone https://github.com/fdbfdvfdvf/123 together
cd together
git checkout together-codespace
npm install
PORT=3121 npm start
# open http://localhost:3121
```

## With PostgreSQL
```bash
createdb together
DATABASE_URL=postgres://user:pass@localhost:5432/together PORT=3121 npm start
# tables are created idempotently at boot; rooms.name is added by a boot migration
```

## Environment variables
`PORT`, `DATA_DIR`, `DATABASE_URL`, `LOG_EVENTS` — see `DEPLOYMENT.md` table.

## Tests
```bash
# 1. syntax
node --check server/index.js server/gateway.js server/rooms.js server/store.js
# 2. local boot smoke (another terminal)
node test/smoke.js http://localhost:3121
# 3. feature harness (lobby, themes, RPS, call presence) — needs socket.io-client (devDep)
node test/features.js http://localhost:3121
# 4. movie sync e2e + WebRTC two-browser: see DEVELOPMENT_ROADMAP.md §Verification
```

## Deploy targets
- **GitHub Codespace (current production)**: see `GITHUB-DEPLOY.md` and `deploy/gh-codespace-deploy.sh`; update flow in `DEPLOYMENT.md`.
- **Any VPS**: `docker build` + nginx TLS termination (snippet in `DEPLOYMENT.md`).

## First steps after boot
1. Open the landing — create a room (name + optional password) or join by code.
2. Invite: header 🔗 button copies `#r=CODE` link.
3. Host-only 🎨 button cycles room themes.
4. Call bar: 🎙 join → mic/cam/screen toggles; 🔊 unmutes remote audio (browser autoplay policy).
