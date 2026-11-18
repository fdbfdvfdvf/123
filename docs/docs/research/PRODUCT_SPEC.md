# Product specification (Together)

Derived from `KOSMI_ANALYSIS.md`; every item here is implemented in this repo unless explicitly marked *planned*.

## A. Users
- **Guest identity**: nickname only, sent with `join`; server assigns `uid` (random 16-hex). No registration — deliberate: matches Kosmi's "no sign-up" model and removes password-storage surface. *Planned:* optional registered accounts.
- Roles: `host` (first member; re-assigned to earliest member on leave) and `guest`. Host can kick (5-minute IP ban) and change room theme. All members have equal playback control by design.
- Presence: roster broadcast on every join/leave/call change; nickname ≤24 chars, sanitized server-side.

## B. Rooms
- Create via `POST /api/rooms` (creator name + room name + optional password). 5-char code from a 31-char unambiguous alphabet (`randCode`).
- Join: `join` WS event with code + password (SHA-256 compared server-side); invite link `/#r=CODE` pre-fills landing.
- Public lobby: live rooms without password and with ≥1 member, sorted by population, max 12 cards, 12s refresh.
- Capacity 12; full room → reject with message. Empty rooms are closed and deleted from memory after 30 min idle (movies wiped via `mvfiles.cleanupRoom`).
- **Themes**: `room.theme` (host-only) → CSS variables for the whole app; persisted in `room_state` (`theme` key).
- Controller lock: any member can claim exclusive control of co-browse; host can always override.

## C. Real-time communication
- Text chat: WS `chat`, persisted ≤2000/room, ≤1000 chars, 10 msgs/6s rate limit, typing indicator, emoji reactions.
- Voice/video: WebRTC mesh via `rt.sig` relay; call presence via `rtc.join/leave` + `rtc.roster`; mic/cam/screen state via `rtc.state`; deterministic initiator (uid compare) prevents offer glare; speaking rings computed locally (WebAudio RMS) with zero network traffic.
- Screen sharing: `getDisplayMedia({video, audio})`; system audio + microphone are mixed into one track (WebAudio `MediaStreamDestination`); stop restores camera/mic tracks.

## D. Watch party
- **YouTube**: `yt.set` (ID extracted client-side from any URL shape) + `yt.state` (`play/pause/seek/rate/sync`); host sends 8s heartbeat; everyone's player applies commands locally.
- **Shared movie**: chunked upload (8 MB chunks, sequential, token-gated 2h TTL) → `mv.set` activates for all → everyone streams the same server file with Range requests; symmetric 2.5s heartbeats; anti-rollback: `sync` heartbeats are ignored for 3s after someone seeks; host/uploader can eject (file wipe + broadcast).

## E. Screen sharing — see `WEBRTC_SETUP.md` (replaceTrack flow, no renegotiation).

## F. Shared browsing
- Sandboxed iframe (`allow-scripts allow-same-origin allow-forms allow-popups`, `referrerpolicy=no-referrer`), shared URL stack (≤30), back/fwd/zoom/reload broadcast, cursor sharing.
- Honest limitation (also documented in-UI): sites refusing to be embedded (X-Frame-Options/CSP) show a fallback; in-page click/type is not possible without a server-side browser — *planned* milestone.

## G. Games (modular)
- Game pane hosts tab-switched games; each game is a server-authoritative state machine broadcast as one event (`tt` / `rps`).
- Tic-tac-toe: first two members take ✕/⭕, server validates turn/occupation/win, persists scores; reset host-or-controller only.
- RPS: explicit seats, picks hidden until both chosen, server computes winner, persistent wins per seat pair, "new match" resets scores.

## Error & loading states
- All commands are acked or produce `err {code}` → mapped to localized toasts (`rate`, `locked`, `forbidden`, `seatbusy`, `callfull`, `badmove`, `badurl`, …).
- Upload progress %, "no movie yet" empty state, reconnect toast + automatic re-join (state re-hydrates from server snapshot).

## Out of scope by policy
DRM-protected commercial streams (no circumvention), retro ROMs without verified license, payments/Premium.
