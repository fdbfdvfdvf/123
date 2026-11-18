# REST API

Base: same origin as the app. All bodies JSON unless noted. Errors: `{ ok:false, err: "code" | "message فارسی" }` with 4xx/5xx. Rate limits noted per route.

## Health
`GET /api/health` → `{ ok:true, ts, storage:"file"|"postgres", rooms:<live count> }` — public, used by monitoring/wake scripts.

## Rooms
| Method & path | Auth | Body / query | Response | Notes |
|---|---|---|---|---|
| `POST /api/rooms` | public | `{ name(≤80, required), roomName(≤60, optional), pass(≤64, optional) }` | `{ ok, code(5ch), name }` | 6 collision retries; pass stored as SHA-256 |
| `GET /api/rooms` | public | — | `{ ok, rooms:[{ code, name, online, inCall }] }` | **Lobby**: live rooms only, no password, ≥1 member, sorted by `online` desc, max 12 |
| `GET /api/rooms/:code` | public | — | `{ ok, code, name, hasPass, online }` | 404 if unknown/closed |

## Shared movie upload
| Method & path | Auth | Notes |
|---|---|---|
| `GET /api/mv/token?room=CODE` | room must exist | 10 req/min/IP → 429. Returns `{ ok, token }` (32 hex, TTL 2 h). |
| `POST /api/mv/upload?room&token&name&i&last` | token valid for that room | Body: raw bytes (`type:()=>true` accepts any Content-Type — browser Blobs included). Chunk ≤8 MB (+64 KB headroom), `i` must equal expected sequence → else 409. `last=1` finalizes. **Filename is sanitized, not rejected** — brackets, apostrophes, commas etc. are normalized (`sanitizeName`); the response returns the final `{ ok, idx, name }` and the client uses that name in `mv.set`. |
| `GET /mvfiles/:room/:file` | public | Range-capable (206) streaming; 404 after eject/cleanup; filename re-sanitized on serve (`sanitizeName`, video extensions only). |

## Administration
Planned (M11): `GET /api/admin/stats` behind `ADMIN_TOKEN` — returns rooms, members, calls, storage usage. Not implemented yet (no fake endpoints shipped).

## Validation summary
Every string passes `safeStr` (control-char strip + clamp); room codes uppercase `^[A-Z0-9]{4,10}$`; YouTube IDs `^[\w-]{6,64}$` (11-char extraction client-side); co-browse URLs must parse as http/https (`guard.isValidUrl`); JSON bodies capped at 64 KB; WS payloads capped at 1 MB (`maxHttpBufferSize`), signaling payloads stringified-capped at 16 KB.
