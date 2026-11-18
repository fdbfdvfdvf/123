# Kosmi product analysis (public observation only)

Sources actually consulted: `kosmi.io` (landing), `kosmi.io/pricing`, web search snippets of kosmi.io marketing pages, Google Play / App Store listings. **No private source code, internal APIs, or infrastructure was inspected, and nothing below claims knowledge of them.** Every "Verified" item is quoted/paraphrased from those public pages; everything else is marked Assumed.

## Verified observations

### Positioning & entry
- "Free Watch Party & Virtual Hangout Platform"; positioned as a Discord alternative with screen share.
- Landing has **no login form** — CTA is **Launch → app.kosmi.io**; plus "Check out the **public rooms in the lobby**".
- "No sign-up, no hassle", "Free to use, no credit card needed", "Optional Premium for extras", "No downloads, works right in your browser", mobile app available.

### Features advertised
- Watch parties "perfectly synced" from **Netflix, YouTube, Disney+, or any streaming service** (SEO pages: Netflix Party, Disney+ Watch Party, HBO Max Watch Party, YouTube Together).
- "Voice, video and messaging are fully integrated".
- "Shared browsing, screen sharing, link sharing, file sharing".
- Screen share **sends system audio with the picture**; "free up to 720p; 1080p is part of Kosmi Premium".
- Customizable rooms: "A virtual living room, drive-in, games room, coffee shop, even a pub. You can make multiple rooms."
- Games named in footer links: Poker, 8 Ball Pool, Shuffleboard, Mini Golf, Four Colors, Cornhole, Blast Arena, Kosmic Kart, Cards Against Humanity, SNES Party, NES Party, PSX Party, OpenArena, Card Tables, Wortle (retro = emulator "Party" variants).

### Not observable / assumed (do not treat as fact)
- Exact Premium pricing, quotas, and feature gating beyond the 720p note.
- Anything about signaling topology (SFU vs mesh), server stack, database schema, room storage, TURN providers.
- In-app flows (registration, room settings, moderation UI) — the app itself was not crawled.

## Implications for this platform (decisions)

| Kosmi capability | Our equivalent | Decision / gap |
|---|---|---|
| Launch, no sign-up | Guest nickname join by code/link | Same model; accounts deliberately deferred |
| Public lobby | `GET /api/rooms` live public rooms on landing | Implemented (password rooms excluded) |
| Watch parties | YouTube sync + **own-file** movie upload (≤2 GB) | We add file upload (Kosmi's page doesn't advertise it); commercial DRM streams are **out of scope by policy** (no DRM circumvention) |
| Voice/video integrated | WebRTC mesh call bar + tiles | Implemented; mesh is fine ≤ ~8 callers, SFU on roadmap |
| Screen share + system audio | getDisplayMedia + WebAudio mic/system mix | Implemented |
| Room themes | 5 CSS-variable themes, host-only, persisted | Light version implemented |
| Game catalog | Tic-tac-toe + RPS (server-authoritative), modular pane | 2 games now; launcher pattern ready for more |
| Retro emulators | **Not implemented** | Requires legally distributable ROMs + licensed cores; roadmap item with strict legality gate |
| Premium tier | Not implemented | Single free tier; documented for future |
| Mobile app | Responsive PWA-capable web | Web only |
