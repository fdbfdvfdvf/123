# WebRTC setup

## Current architecture: full mesh (P2P)
Every caller holds a direct `RTCPeerConnection` to every other caller. Verified in production with 2 real browser instances (fake media) — 12/12 checks × 2 role orders. Mesh is the right call for ≤ ~8 simultaneous callers; beyond that, deploy an SFU (below).

## Signaling
Server relays offers/answers/ICE through the room-scoped, rate-limited `rt.sig` event (≤16 KB payload). **Glare prevention**: the peer with the lexicographically smaller `uid` is always the initiator — the other side only ever answers. Retries: on `connectionState === 'failed'` the initiator tears down and re-offers if the peer is still in the call roster.

## Negotiation rules (the part that bites)
1. **Initiator** pre-creates exactly two transceivers — audio (with mic track if any) and video (empty) — both `sendrecv`. This reserves m-lines so later track swaps need no renegotiation.
2. **Answerer must NOT pre-create transceivers.** It calls `setRemoteDescription(offer)` first, takes the transceivers the offer created, upgrades their direction to `sendrecv`, and attaches local tracks with `sender.replaceTrack()` *before* `createAnswer/setLocalDescription`. (Pre-creating on the answer side breaks association — the answerer's media silently never reaches the initiator. This exact bug was caught by the two-browser test and fixed in commit `fix(webrtc): answerer takes transceivers from offer…`.)
3. Camera enable / screen share / screen stop = `replaceTrack` on the saved senders — **zero renegotiation**, sub-second switch.
4. Late joiners: existing callers re-emit roster; deterministic initiator rule covers the new pair automatically.
5. Reconnect: client re-joins the room (state snapshot includes `rtc` list) and re-emits `rtc.join`; peers are rebuilt from the roster.

## Screen share with system audio
`getDisplayMedia({video:{frameRate:{ideal:15}}, audio:true})`. If a system-audio track exists, mic + system audio are mixed into one track via `AudioContext.createMediaStreamDestination()` (both sources connected to the same destination) and that mixed track replaces the audio sender — callers hear the movie *and* the room together, Kosmi-style. Stop → restore mic track + camera (or null).

## ICE
```js
{ iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] }
```
STUN is enough for same-region/codespace clients. **TURN is not shipped** (no credentials to leak, nothing hardcoded); to add one, extend `PC_CONFIG` in `web/index.html`:
```js
iceServers: [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "turn:turn.example.com:3478", username: "app", credential: process.env.TURN_SECRET /* server-injected, never hardcoded */ }
]
```
Serve it via a tiny authenticated config endpoint if you need env-based TURN — do not commit credentials. coturn self-hosting guide: standard Docker image, UDP 3478 + relay range 49152-65535 open.

## Test harness
`scripts/rtctest/rtc2.js` (repo-external tool) launches two headless Chromium contexts with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`, joins one room, clicks the call bar, then asserts via `window.__rtcState()`: 1 peer per side, ICE `connected`, remote `audio` (and `video` after camera toggle), 2 tiles with live `srcObject`, and clean peer teardown after leaving the call. It also handles GitHub's port-forward interstitial ("Continue" submit).
