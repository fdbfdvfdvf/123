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

## Local movie mode (no upload)
| Event | Auth | Notes |
|---|---|---|
| `mv.local.set` (socket) | member, 4/10 s | Host declares a device-local file: room.mv gets `mode:'local'`, server stores **no bytes**; broadcasts `mv.local.file {name, size, dur, hostUid, hostName, hostSid}`. Any prior server-mode movie file is cleaned up. |
| `mvp.want` (socket) | member | Viewer asks for the local stream; server routes to the host socket → host gets `mvp.need {to: viewerSid, uid}`. |
| `mvp.sig` (socket) | member, 150/10 s | SDP offer/answer + ICE relay between host and viewers, targeted by socketId, stringified-capped 16 KB. One dedicated WebRTC peer connection per viewer (`captureStream` of the host's `<video>`); STUN-only. |
| sync | — | Host keeps emitting `mv.state` heartbeats; viewers render positions from them and never emit (a live stream can't seek) — play/pause/seek/rate commands run on the host's device and flow to everyone through the stream. |

When the host leaves/disconnects, the room's local movie is auto-closed (`mv.close` broadcast + persisted reset) — the file lives only on their device. A viewer-side watchdog restarts ICE and shows a visible retry toast instead of a silent black screen; ICE uses Google STUN with a community TURN fallback (openrelay.metered.ca) for hard-NAT peers.

## Administration
Planned (M11): `GET /api/admin/stats` behind `ADMIN_TOKEN` — returns rooms, members, calls, storage usage. Not implemented yet (no fake endpoints shipped).

## Validation summary
Every string passes `safeStr` (control-char strip + clamp); room codes uppercase `^[A-Z0-9]{4,10}$`; YouTube IDs `^[\w-]{6,64}$` (11-char extraction client-side); co-browse URLs must parse as http/https (`guard.isValidUrl`); JSON bodies capped at 64 KB; WS payloads capped at 1 MB (`maxHttpBufferSize`), signaling payloads stringified-capped at 16 KB.
