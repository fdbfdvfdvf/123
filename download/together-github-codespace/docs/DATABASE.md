# Database

## Current live schema

Two interchangeable backends implement the identical interface (`store.js`). The **PostgreSQL DDL is the canonical schema** (executed idempotently at boot; FileStore mirrors it as JSON):

```sql
CREATE TABLE IF NOT EXISTS rooms (
  id         TEXT PRIMARY KEY,          -- crypto.randomUUID()
  code       TEXT UNIQUE NOT NULL,      -- 5-char public code
  pass_hash  TEXT,                      -- SHA-256 hex, NULL = public room
  name       TEXT,                      -- display name (lobby)
  created_at BIGINT NOT NULL,
  closed_at  BIGINT                     -- tombstone after 30-min emptiness
);
CREATE TABLE IF NOT EXISTS messages (
  id      BIGSERIAL PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  name    TEXT NOT NULL, body TEXT NOT NULL, ts BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_room ON messages (room_id, id);
CREATE TABLE IF NOT EXISTS strokes (          -- whiteboard, JSON per stroke
  id BIGSERIAL PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  data TEXT NOT NULL, ts BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_strokes_room ON strokes (room_id, id);
CREATE TABLE IF NOT EXISTS room_state (       -- KV snapshot of stage/game state
  room_id TEXT NOT NULL REFERENCES rooms(id),
  k TEXT NOT NULL, v TEXT NOT NULL,           -- k ∈ cov|yt|tt|mv|theme|rps
  PRIMARY KEY (room_id, k)
);
```

**Boot migration** (for pre-existing deployments): `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS name TEXT` (run in `PgStore.init()`, failures swallowed).

### What lives in `room_state`
`yt` (video id + paused state — playback position intentionally reset on restart), `mv` (active movie metadata incl. `pos/posAt/act/rate`), `tt` (cells/turn/winner/line/scores), `rps` (seats/wins/phase/last), `theme`, `cov` (URL stack + zoom).

### What is intentionally NOT persisted
Live presence (`members`), call state (`inCall/mic/cam/screen`), cursors, typing, upload tokens, bans (in-memory, 5-min TTL).

## Interface (backend-agnostic)

`createRoom({id,code,passHash,name})`, `getRoom(code)`, `closeRoom(id)`, `addMessage(roomId,{name,body,ts})`, `getMessages(roomId,limit=100)`, `addStroke/getStrokes/clearStrokes/removeStroke`, `setState/getState(roomId)`.

Retention rules (applied in gateway/store): messages ≤2000 (trim to 1000), strokes ≤4000 (trim to 2500), URL stacks ≤30.

## Target relational schema (planned Prisma milestone)

The full multi-service schema from the original brief — users, user_profiles, user_settings, sessions, room_members, room_permissions, room_invitations, room_bans, private_messages, attachments, notifications, friendships, game_sessions/game_players, subscriptions, payments, moderation_logs, audit_logs — is intentionally **not** created yet: it would model authorization flows that don't exist (accounts, payments). It is specified as the first deliverable of Milestone M3 (accounts) in `DEVELOPMENT_ROADMAP.md`, so tables appear together with the code that uses them — no dead schema.

Migrations today: none managed (idempotent DDL at boot). Planned: `prisma migrate` once Prisma lands.
