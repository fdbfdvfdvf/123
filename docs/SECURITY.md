# Security

Principles: server-authoritative state, validate every event, sanitize every string, no secrets in the client, fail visibly.

## Identity & sessions
- **No passwords in the app itself** — the only secret-like data is the *room password*: hashed with SHA-256 at creation (`guard.sha256`), never stored or logged in clear. Comparison happens server-side on `join`.
- Guests get a server-generated random `uid` (`crypto.randomBytes(8)`). No JWT/session cookies exist, so there is no token-theft surface. *Planned* accounts (M3) will add argon2/bcrypt hashing + HTTP-only Secure SameSite=Strict cookies — documented before implemented.
- Kick = socket disconnect + **IP-based temporary ban** (5 min) checked at `join`.

## Transport
- HTTPS is terminated by GitHub Codespaces port forwarding (production) or by your reverse proxy (self-host; `Dockerfile` + `deploy/compose.codespace.yaml` provided). WSS follows automatically.
- Socket.IO: `cors: { origin: false }` (same-origin only), ping interval 20 s / timeout 40 s (mobile NAT survival).

## Input validation (server-side, every event)
- `safeStr()`: strips control chars, clamps length (names 24, chat 1000, URLs 200…).
- Room codes: uppercase, `^[A-Z0-9]{4,10}$`; YouTube IDs `^[\w-]{6,64}$`; upload filenames: **sanitized, not rejected** — extension must be a video type (`mp4|webm|mkv|mov|m4v|avi|ogv`), everything outside the safe charset (`\w.()-` + Persian range) becomes a space, consecutive dots collapse (no `../` traversal), slash/backslash removed, ≤100 chars; the sanitized name is returned to the client and reused for `mv.set` so disk and URL always match.
- Co-browse URLs: must parse as absolute `http:`/`https:` (`isValidUrl`) — no `javascript:`/`data:` injection into the shared iframe.
- Numbers pass `clamp()` bounds (positions 0–24 h, rate 0.25–2, strokes ≤2400 points, coordinates bounded).
- JSON body ≤64 KB; WS message ≤1 MB; signaling relay payload stringified-capped 16 KB; upload chunk ≤8 MB.
- Local movie mode: the file never leaves the host's device — media flows peer-to-peer over WebRTC (STUN only, no media through the server); `mvp.sig` relay carries only SDP/ICE (16 KB cap, 150/10 s per socket, targeted strictly at room members); host disconnect auto-closes the movie and resets persisted state; filenames pass the same `sanitizeName` as uploads.

## XSS
The client renders **all** user-derived strings through `esc()` (HTML entity escaping) — chat bodies, names, room names, file names, lobby cards. React-like frameworks are absent, so escaping is manual and consistently applied. No `innerHTML` receives unsanitized data.

## SQL injection
All PostgreSQL access uses **parameterized queries only** (`$1…$n`); no string-concatenated SQL anywhere in `store.js`.

## Rate limiting & abuse
`limits.js` token buckets per socket per event: chat 10/6 s, strokes 90/6 s, yt 30/6 s, mv 40/6 s, signaling 150/10 s, rtc.join 8/60 s, cursors 40/6 s, rps 20/10 s. Upload token endpoint: 10/min/IP (429). Room cap 12; call cap 10. Empty rooms auto-close after 30 min; movie files wiped on eject and room close.

## File upload safety
- Token-gated (random 16 bytes, room-bound, 2 h TTL, sequential chunk index enforced → no arbitrary writes).
- Files land in `DATA_DIR/mv/<ROOM>/` with sanitized names; served through express `sendFile` with `dotfiles:'deny'`; range requests only for that directory.
- 2 GB per-file cap enforced client + server; single active movie per room; `cleanupOthers` removes stale files when a new one activates.

## Frontend hardening
- `Cache-Control: no-store` on HTML (fresh client after every deploy; assets are etag-revalidated).
- `X-Content-Type-Options: nosniff`; `x-powered-by` disabled.
- Shared iframe is sandboxed (`allow-scripts allow-same-origin allow-forms allow-popups`) with `referrerpolicy=no-referrer`.
- Compression enabled with a size threshold (no uncompressed secrets echoed back).

## Secrets management
- `GH_TOKEN`, `DATABASE_URL`, and any future `ADMIN_TOKEN`/`TURN_SECRET` live only in the environment of the server process / deploy scripts — never in `web/` (the entire client is one static file with zero embedded credentials), never committed. Deploy scripts receive the token via env, not CLI args in files.
- Known trade-off (documented, not hidden): SHA-256 for room passwords is weak against offline cracking if the store leaks; acceptable only because values are low-value room passphrases — M3 will replace with argon2id when real accounts arrive.

## Moderation
Host-only kick + 5-min IP ban; controller lock to protect shared stages; sys messages audit join/leave/kick into the chat log (persisted).
