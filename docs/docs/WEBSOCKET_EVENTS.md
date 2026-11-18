# WebSocket events

Transport: Socket.IO (default namespace). One socket = one room membership (`join` required for everything else). Every event handler re-validates membership and applies a per-socket token bucket (`limits.js`). Payload sizes capped by `maxHttpBufferSize` 1 MB.

## Connection lifecycle
| Client → Server | Payload | Server → Client (broadcast) | Notes |
|---|---|---|---|
| `join` | `{code, name, pass}` + ack | `welcome {you, state}`, `roster`, `sys` | ack `{ok, you:{uid,name,role,side}, state}`; full snapshot = chat(100) + strokes(400) + cov/yt/tt/mv/rps/theme/rtc. Duplicate `join` (reconnect) releases previous membership/sides first. Full room → ack err. |
| `disconnect` | — | `roster`, `sys`, (`rtc.roster` if in call) | Host re-assigned to earliest member. |

## Chat & presence
| Event | Client→Server | Broadcast | Limits |
|---|---|---|---|
| `chat` | `{body≤1000}` | `chat {uid,name,body,ts}` (all) + persist | 10/6 s |
| `typing` | `{on}` | `typing {on,name}` (others) | — |
| `cursor` | `{pane:"board"|"cov", x, y}` | `cursor {by,pane,x,y}` (others) | 40/6 s |

## Stages
| Event | Client→Server | Broadcast | Authority / limits |
|---|---|---|---|
| `stroke` | `{d:{id,t:"pen"|"eraser",c,w,p[≤2400]}}` | `stroke {d}` + persist | 90/6 s |
| `undost` / `clearw` | `{id}` / — | same to all + persist | — |
| `cov.nav` | `{url}` (http/https only) | `cov.nav {url}` + persist | controller-lock aware; 20/6 s |
| `cov.ctl` | `{act:"back"|"fwd"|"zoom"|"reload", z}` | `cov.ctl {idx,zoom,act}` / `cov.reload` | persist |
| `yt.set` | `{v: 11-char id}` | `yt.set {v,hostUid}` + persist | host = setter |
| `yt.state` | `{act:"play"|"pause"|"seek"|"rate"|"sync", pos, rate}` | `yt.state {act,pos,rate,by}` | 30/6 s; everyone controls by design |
| `mv.set` | `{file,s≤2.1e9,dur}` (after upload) | `mv.file {url,name,size,dur,hostUid,hostName}` + persist; old room files wiped | membership only |
| `mv.state` | `{act:"play"|"pause"|"seek"|"sync"|"rate", pos, rate}` | `mv.state {act,pos,rate,by}` | 40/6 s; anti-rollback: `sync` ignored 3 s after another member's seek |
| `mv.close` | — | `mv.close` + file wipe + persist | host or uploader only |

## Voice / video / screen (WebRTC)
| Event | Client→Server | Broadcast | Limits |
|---|---|---|---|
| `rtc.join` | `{mic, cam}` | `rtc.roster {list:[{uid,name}]}` + `roster` | 8/60 s; cap 10 in call → `err callfull` |
| `rtc.leave` | — | `rtc.roster` + `roster` | — |
| `rtc.state` | `{mic?, cam?, screen?}` | `rtc.state {uid,mic,cam,screen}` | 30/10 s; caller must be in call |
| `rt.sig` | `{to:uid, data:{t:"offer"|"answer"|"ice", s?, c?}}` | relayed as `rt.sig {from, data}` to target only | 150/10 s; target must be member; payload ≤16 KB |

## Games
| Event | Client→Server | Broadcast | Rules |
|---|---|---|---|
| `tt.move` | `{i:0..8}` | `tt {cells,turn,winner,line,scores}` | side must match turn; server computes win/draw; spectator rejected |
| `tt.reset` | — | `tt` (scores kept) | host or controller |
| `rps.seat` | `{seat:"p1"|"p2"|null}` | `rps {seats,wins,phase,picks?,last}` | seat swap allowed; occupied → `err seatbusy`; 20/10 s |
| `rps.pick` | `{pick:"r"|"p"|"s"}` | `rps` (picks masked until both) | seated members only; server computes winner at reveal |
| `rps.reset` | `{newmatch?}` | `rps` | clears picks; `newmatch` also clears wins |

## Room customization
| Event | Payload | Broadcast | Authority |
|---|---|---|---|
| `room.theme` | `{theme:"default"|"cafe"|"pub"|"drivein"|"arcade"}` | `room.theme {theme}` + persist | **host only** → else `err forbidden` |

## Error channel
`err {code}` — codes: `rate`, `locked`, `forbidden`, `badurl`, `badvid`, `badmove`, `seatbusy`, `noseat`, `callfull`, `badroom`. Client maps them to localized toasts; unknown codes render raw (fail-visible).
