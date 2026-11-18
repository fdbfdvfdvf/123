# Development roadmap & verification

## Milestone status (from the 13-milestone brief)

| # | Milestone | Status | Notes |
|---|---|---|---|
| M1 | Research & specification | **Done** | `docs/research/KOSMI_ANALYSIS.md` (verified vs assumed), `PRODUCT_SPEC.md` |
| M2 | UI/UX & responsive front-end | **Done (v1)** | FA/EN, RTL, dark, mobile drawer + wrapped tabs, toasts, empty/error states; a React rewrite is *optional* polish, not a blocker |
| M3 | Authentication & user management | **Deferred** | Guest-first by design (Kosmi model); accounts = next user-facing milestone; schema sketched in `DATABASE.md` |
| M4 | Rooms | **Done** | Create/join/leave, password, public lobby, host/kick/ban, cap 12, themes, invite links, persistent state |
| M5 | Chat & WS infrastructure | **Done** | Persisted chat, typing, reactions, rate limits, reconnection re-hydration |
| M6 | Voice & video | **Done (mesh)** | Audio + camera, speaking rings, per-tile volume, reconnect rebuild; mesh limit ~8 callers |
| M7 | Screen sharing | **Done** | Video + **mixed system+mic audio**, no-renegotiation switching, badge/wide tile |
| M8 | Watch party | **Done** | YouTube sync + own-file movie upload ≤2 GB with symmetric heartbeat sync; DRM streams excluded by policy |
| M9 | Multiplayer games | **Partial** | Tic-tac-toe + RPS (server-authoritative) shipped; poker/draw-guess/retro = planned; emulator legality gate documented |
| M10 | Shared browser | **Partial** | Synced iframe co-browsing shipped (view + nav + zoom + cursors); in-page interaction needs a server-side browser (planned, heavyweight) |
| M11 | Admin dashboard | **Not started** | `/api/admin/stats` + ADMIN_TOKEN page specified in SECURITY/API docs; nothing fake shipped |
| M12 | Security, testing, optimization | **Done (v1)** | See SECURITY.md; 48 live checks pass; compression, gzip, no-store, rate limits, sanitization |
| M13 | Production deployment | **Done** | Live on user's Codespace with one-command wake/update (`scripts/up.sh`) |

## Verification suites (all green on the live deployment)

| Suite | Checks | What it proves |
|---|---|---|
| `test/smoke.js` | boot/health/room REST | server up, REST contract |
| `test/features.js` | 16 | lobby lists public but not password rooms, room names persist, theme host-only + broadcast, RPS seats/picks/reveal/scores + `seatbusy`, call presence roster join/leave |
| movie e2e (4 clients) | 20 | chunked upload byte-exact, symmetric broadcast, anti-rollback interpolation, late-joiner catch-up, host-only close, disk cleanup, 404 after close |
| WebRTC two-browser (`rtc2.js`) | 12 × 2 role orders | ICE connected both ways, remote audio both ways, camera track without renegotiation, both tiles live `srcObject`, clean teardown |

## Next up (priority order)
1. **Group voice scaling** — SFU (LiveKit) behind the same `rtc.*` API for >8 callers + TURN env support.
2. **Admin dashboard (M11)** — stats endpoint + minimal admin UI (users/rooms/kicks), RBAC via `ADMIN_TOKEN`.
3. **Accounts (M3)** — optional registration, avatar upload, friends; argon2id; sessions.
4. **Games M9** — draw-and-guess (reuses board events), modular game registry; retro emulators only with verified-legal cores + user-supplied ROMs.
5. **Shared browser M10 v2** — headless-Chromium puppeteer pool with CDP input sync (memory/CPU budgeted per room).
6. **Mobile polish** — PWA manifest + service worker for installability.
