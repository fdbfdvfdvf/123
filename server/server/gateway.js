/* Gateway — Socket.IO با مرجع حق سرور:
   presence، چت ماندگار، تخته، هم‌مرورگری، یوتیوب، فیلم مشترک، تیک‌تاک‌تو (اعتبارسنجی نوبت روی سرور)،
   قفل کنترل، کیک، رلهٔ سیگنالینگ WebRTC، محدودیت نرخ و پایداری بعد از ریستارت. */
const crypto = require('crypto');
const { Limits } = require('./limits');
const { isValidUrl, sha256, safeStr, randCode, clamp } = require('./guard');
const mvf = require('./mvfiles');

const rid = () => crypto.randomBytes(8).toString('hex');

function newRoom(id, code, passHash, name) {
  return {
    id, code, passHash: passHash || null, name: (name || '').trim().slice(0, 60) || code,
    members: new Map(),           // sid -> {uid, name, role, side, joinedAt, inCall, mic, cam, screen}
    hostUid: null, controller: null,
    chat: [], strokes: [],
    cov: { stack: [], idx: -1, zoom: 1 },
    yt: { v: null, hostUid: null, act: 'pause', pos: 0, rate: 1 },
    tt: { cells: Array(9).fill(''), turn: 'x', winner: null, line: null, scores: { x: 0, o: 0 }, sides: { x: null, o: null } },
    mv: { active: false, mode: 'server', hostUid: null, name: '', file: '', size: 0, dur: 0, pos: 0, posAt: 0, act: 'pause', rate: 1, lastSeekBy: null, lastSeekAt: 0 },
    theme: 'default',
    rps: { seats: { p1: null, p2: null }, picks: { p1: null, p2: null }, wins: { p1: 0, p2: 0 }, phase: 'pick', last: null },
    emptySince: null,
  };
}

function roster(room) {
  return [...room.members.values()].map((m) => ({ uid: m.uid, name: m.name, role: m.role, side: m.side, inCall: !!m.inCall, mic: !!m.mic, cam: !!m.cam, screen: !!m.screen }));
}

const THEMES = ['default', 'cafe', 'pub', 'drivein', 'arcade'];

// اعضای در حال تماس — مبنای mesh WebRTC
function callList(room) {
  return [...room.members.values()].filter((m) => m.inCall).map((m) => ({ uid: m.uid, name: m.name }));
}

// نمای عمومی RPS — انتخاب‌ها فقط در فاز reveal فاش می‌شوند
function rpsView(room) {
  const r = room.rps;
  const seat = (s) => {
    const uid = r.seats[s];
    const m = uid && [...room.members.values()].find((x) => x.uid === uid);
    return { uid, name: m ? m.name : null, picked: !!r.picks[s] };
  };
  return { seats: { p1: seat('p1'), p2: seat('p2') }, wins: r.wins, phase: r.phase, picks: r.phase === 'reveal' ? r.picks : null, last: r.last };
}

// موقعیت مرجع فیلم با پیش‌روی زمانی — کسی که وسط فیلم می‌پیوندد عقب نمی‌ماند
function mvPos(mv) {
  if (mv.act !== 'play' || !mv.posAt) return mv.pos;
  return Math.min(mv.pos + ((Date.now() - mv.posAt) / 1000) * mv.rate, mv.dur || 1e9);
}

function stateSnapshot(room) {
  return {
    chat: room.chat.slice(-100), strokes: room.strokes.slice(-400),
    cov: room.cov, yt: { v: room.yt.v, act: room.yt.act, pos: room.yt.pos, rate: room.yt.rate },
    tt: { cells: room.tt.cells, turn: room.tt.turn, winner: room.tt.winner, line: room.tt.line, scores: room.tt.scores },
    mv: room.mv.active
      ? { active: true, mode: room.mv.mode || 'server', hostUid: room.mv.hostUid, name: room.mv.name, size: room.mv.size, dur: room.mv.dur, pos: mvPos(room.mv), act: room.mv.act, rate: room.mv.rate, url: room.mv.file ? `/mvfiles/${room.code}/${encodeURIComponent(room.mv.file)}` : '' }
      : { active: false, hostUid: null },
    controller: room.controller, hostUid: room.hostUid,
    theme: room.theme, rps: rpsView(room), rtc: callList(room),
  };
}

function install(io, store) {
  const limits = new Limits();
  const rooms = new Map();          // code -> room
  const bans = new Map();           // code -> Map(uid-ish ip, until)
  const dirty = new Set();          // room codes needing state persist

  if (process.env.LOG_EVENTS) {     // دید دیباگ سمت سرور
    io.on('connection', (s) => {
      s.onAny((ev, ...args) => {
        try { console.log(`[evt] room=${s.data?.room || '-'} sock=${s.id.slice(-5)} ev=${ev} ${JSON.stringify(args[0] || {}).slice(0, 140)}`); } catch {}
      });
      s.on('disconnect', (r) => console.log(`[evt] room=${s.data?.room || '-'} sock=${s.id.slice(-5)} ev=disconnect ${r}`));
    });
  }

  async function hydrate(code) {
    let room = rooms.get(code);
    if (room) return room;
    const row = await store.getRoom(code);
    if (!row) return null;
    room = newRoom(row.id, row.code, row.pass_hash, row.name);
    const [msgs, strks, st] = await Promise.all([store.getMessages(row.id), store.getStrokes(row.id), store.getState(row.id)]);
    room.chat = msgs.map((m) => ({ name: m.name, body: m.body, ts: Number(m.ts) }));
    room.strokes = strks;
    try { if (st.cov) room.cov = JSON.parse(st.cov); } catch {}
    try { if (st.yt) room.yt = { ...room.yt, ...JSON.parse(st.yt) }; } catch {}
    try { if (st.tt) room.tt = { ...room.tt, ...JSON.parse(st.tt) }; } catch {}
    try { if (st.mv) room.mv = { ...room.mv, ...JSON.parse(st.mv) }; } catch {}
    try { if (st.rps) room.rps = { ...room.rps, ...JSON.parse(st.rps) }; } catch {}
    try { if (st.theme && THEMES.includes(st.theme)) room.theme = st.theme; } catch {}
    rooms.set(code, room);
    return room;
  }

  function persistState(code) { dirty.add(code); }

  setInterval(async () => {
    for (const code of dirty) {
      const room = rooms.get(code);
      if (!room) { dirty.delete(code); continue; }
      try {
        await store.setState(room.id, 'cov', JSON.stringify(room.cov));
        await store.setState(room.id, 'yt', JSON.stringify({ v: room.yt.v, act: 'pause', pos: 0, rate: 1 }));
        await store.setState(room.id, 'tt', JSON.stringify({ cells: room.tt.cells, turn: room.tt.turn, winner: room.tt.winner, line: room.tt.line, scores: room.tt.scores }));
        await store.setState(room.id, 'mv', JSON.stringify(room.mv));
        await store.setState(room.id, 'theme', room.theme);
        await store.setState(room.id, 'rps', JSON.stringify({ seats: room.rps.seats, wins: room.rps.wins, phase: room.rps.phase, last: room.rps.last }));
      } catch (e) { console.warn('persist state', e.message); }
    }
    dirty.clear();
  }, 3000).unref?.();

  setInterval(() => {   // پاک‌سازی اتاق‌های خالی
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (room.members.size === 0 && room.emptySince && now - room.emptySince > 30 * 60000) {
        store.closeRoom(room.id).catch(() => {});
        rooms.delete(code);
      }
    }
  }, 60000).unref?.();

  function leaveRoom(socket, room, reason) {
    const m = room.members.get(socket.id);
    if (!m) return;
    room.members.delete(socket.id);
    if (room.controller === m.uid) room.controller = null;
    if (room.yt.hostUid === m.uid) room.yt.hostUid = null;
    if (room.mv.hostUid === m.uid) {
      if (room.mv.mode === 'local') {
        // فیلم لوکال روی دستگاهِ میزبان است — خروج او یعنی پایان پخش برای همه
        room.mv = { active: false, mode: 'server', hostUid: null, name: '', file: '', size: 0, dur: 0, pos: 0, posAt: 0, act: 'pause', rate: 1, lastSeekBy: null, lastSeekAt: 0 };
        io.to(room.code).emit('mv.close');
        persistState(room.code);
      } else room.mv.active = false;
    }
    if (room.hostUid === m.uid) {
      const rest = [...room.members.values()].sort((a, b) => a.joinedAt - b.joinedAt);
      room.hostUid = rest.length ? rest[0].uid : null;
      if (rest.length) rest[0].role = 'host';
    }
    // صندلی RPS و حضور تماس عضوِ خارج‌شده پاک می‌شود
    let rpsChanged = false;
    for (const s of ['p1', 'p2']) if (room.rps.seats[s] === m.uid) { room.rps.seats[s] = null; room.rps.picks[s] = null; room.rps.phase = 'pick'; rpsChanged = true; }
    if (room.rps.phase === 'reveal' && rpsChanged) room.rps.phase = 'pick';
    io.to(room.code).emit('roster', { list: roster(room), hostUid: room.hostUid, controller: room.controller });
    if (rpsChanged) io.to(room.code).emit('rps', rpsView(room));
    if (m.inCall) io.to(room.code).emit('rtc.roster', { list: callList(room) });
    io.to(room.code).emit('sys', { msg: `${m.name}${reason || ' خارج شد'}`, ts: Date.now() });
    if (room.members.size === 0) room.emptySince = Date.now();
  }

  io.on('connection', (socket) => {
    socket.data.room = null;
    socket.on('join', async (p, ack) => {
      try {
        const code = safeStr(p?.code, 8).toUpperCase();
        const name = safeStr(p?.name, 24).trim() || 'مهمان';
        if (!code) return ack?.({ ok: false, err: 'کد اتاق لازم است' });
        const banList = bans.get(code);
        if (banList && (banList.get(socket.handshake.address) || 0) > Date.now()) return ack?.({ ok: false, err: 'دسترسی شما موقتاً مسدود است' });
        const room = await hydrate(code);
        if (!room) return ack?.({ ok: false, err: 'اتاق پیدا نشد' });
        if (room.passHash && sha256(p?.pass || '') !== room.passHash) return ack?.({ ok: false, err: 'رمز عبور اشتباه است' });
        if (room.members.size >= 12) return ack?.({ ok: false, err: 'اتاق پر است (سقف ۱۲ نفر)' });

        // join تکراریِ همان سوکت (مثلاً reconnect) — عضویت قبلی باید آزاد شود وگرنه سمت‌ها خراب می‌شوند
        const prev = room.members.get(socket.id);
        if (prev) {
          if (room.tt.sides.x === prev.uid) room.tt.sides.x = null;
          if (room.tt.sides.o === prev.uid) room.tt.sides.o = null;
          if (room.hostUid === prev.uid) room.hostUid = null;
          if (room.controller === prev.uid) room.controller = null;
          room.members.delete(socket.id);
        }

        const uid = rid();
        const isFirst = room.members.size === 0;
        const member = { uid, name, role: isFirst || !room.hostUid ? 'host' : 'guest', joinedAt: Date.now(), inCall: false, mic: false, cam: false, screen: false };
        if (member.role === 'host') room.hostUid = uid;
        // سمت‌های تیک‌تاک‌تو: دو نفر اول
        if (!room.tt.sides.x || ![...room.members.values()].some((x) => x.uid === room.tt.sides.x)) room.tt.sides.x = uid;
        else if (!room.tt.sides.o) room.tt.sides.o = uid;
        member.side = room.tt.sides.x === uid ? 'x' : room.tt.sides.o === uid ? 'o' : 'spec';
        room.members.set(socket.id, member);
        room.emptySince = null;
        socket.data.room = code;
        socket.join(code);

        ack?.({ ok: true, you: { uid, name, role: member.role, side: member.side }, state: stateSnapshot(room) });
        socket.emit('welcome', { you: { uid, name, role: member.role, side: member.side }, state: stateSnapshot(room) });
        io.to(code).emit('roster', { list: roster(room), hostUid: room.hostUid, controller: room.controller });
        socket.to(code).emit('sys', { msg: `${name} وارد شد 👋`, ts: Date.now() });
      } catch (e) { console.warn('join', e.message); ack?.({ ok: false, err: 'خطای سرور' }); }
    });

    socket.on('chat', (p) => {
      const room = rooms.get(socket.data.room); const m = room?.members.get(socket.id);
      if (!room || !m) return;
      if (!limits.check(`chat:${socket.id}`, 10, 6000)) return socket.emit('err', { code: 'rate' });
      const body = safeStr(p?.body, 1000).trim();
      if (!body) return;
      const msg = { uid: m.uid, name: m.name, body, ts: Date.now() };
      room.chat.push(msg); if (room.chat.length > 300) room.chat = room.chat.slice(-200);
      io.to(room.code).emit('chat', msg);
      store.addMessage(room.id, { name: m.name, body, ts: msg.ts }).catch((e) => console.warn('msg persist', e.message));
    });

    socket.on('typing', (p) => {
      const room = rooms.get(socket.data.room); const m = room?.members.get(socket.id);
      if (!room || !m) return;
      socket.to(room.code).emit('typing', { on: !!p?.on, name: m.name });
    });

    socket.on('stroke', (p) => {
      const room = rooms.get(socket.data.room); const m = room?.members.get(socket.id);
      if (!room || !m) return;
      if (!limits.check(`stroke:${socket.id}`, 90, 6000)) return socket.emit('err', { code: 'rate' });
      const d = p?.d;
      if (!d || !['pen', 'eraser'].includes(d.t)) return;
      const pts = Array.isArray(d.p) ? d.p.slice(0, 2400).map((x) => clamp(x, -1, 1e5)) : null;
      if (!pts) return;
      const stroke = { id: safeStr(d.id, 40), t: d.t, c: safeStr(d.c, 16), w: clamp(d.w, 1, 40), p: pts };
      room.strokes.push(JSON.stringify(stroke)); if (room.strokes.length > 2500) room.strokes = room.strokes.slice(-2000);
      socket.to(room.code).emit('stroke', { d: stroke });
      store.addStroke(room.id, JSON.stringify(stroke)).catch(() => {});
    });

    socket.on('undost', (p) => {
      const room = rooms.get(socket.data.room);
      if (!room) return;
      const id = safeStr(p?.id, 40);
      const idx = room.strokes.findIndex((s) => s.includes(`"${id}"`));
      if (idx >= 0) {
        const [removed] = room.strokes.splice(idx, 1);
        io.to(room.code).emit('undost', { id });
        store.removeStroke(room.id, removed).catch(() => {});
      }
    });

    socket.on('clearw', () => {
      const room = rooms.get(socket.data.room);
      if (!room) return;
      room.strokes = [];
      io.to(room.code).emit('clearw');
      store.clearStrokes(room.id).catch(() => {});
    });

    socket.on('cov.nav', (p) => {
      const room = rooms.get(socket.data.room);
      if (!room) return;
      if (!limits.check(`covnav:${socket.id}`, 20, 6000)) return socket.emit('err', { code: 'rate' });
      if (room.controller && room.controller !== room.members.get(socket.id)?.uid) {
        const isHost = room.hostUid === room.members.get(socket.id)?.uid;
        if (!isHost) return socket.emit('err', { code: 'locked' });
      }
      const url = String(p?.url || '');
      if (!isValidUrl(url)) return socket.emit('err', { code: 'badurl' });
      room.cov.stack = room.cov.stack.concat(url).slice(-30);
      room.cov.idx = room.cov.stack.length - 1;
      io.to(room.code).emit('cov.nav', { url });
      persistState(room.code);
    });

    socket.on('cov.ctl', (p) => {
      const room = rooms.get(socket.data.room); const m = room?.members.get(socket.id);
      if (!room || !m) return;
      const act = safeStr(p?.act, 10);
      const c = room.cov;
      if (act === 'back') c.idx = Math.max(0, c.idx - 1);
      if (act === 'fwd') c.idx = Math.min(c.stack.length - 1, c.idx + 1);
      if (act === 'zoom') c.zoom = clamp(p?.z, 0.5, 2);
      if (act === 'reload') { io.to(room.code).emit('cov.reload'); return; }
      io.to(room.code).emit('cov.ctl', { idx: c.idx, zoom: c.zoom, act });
      persistState(room.code);
    });

    socket.on('cursor', (p) => {
      const room = rooms.get(socket.data.room); const m = room?.members.get(socket.id);
      if (!room || !m) return;
      if (!limits.check(`cur:${socket.id}`, 40, 6000)) return;
      socket.to(room.code).emit('cursor', { by: m.uid, pane: safeStr(p?.pane, 10), x: clamp(p?.x, 0, 1e5), y: clamp(p?.y, 0, 1e5) });
    });

    socket.on('yt.set', (p) => {
      const room = rooms.get(socket.data.room); const m = room?.members.get(socket.id);
      if (!room || !m) return;
      const v = safeStr(p?.v, 64);
      if (!/^[\w-]{6,64}$/.test(v)) return socket.emit('err', { code: 'badvid' });
      room.yt = { v, hostUid: m.uid, act: 'pause', pos: 0, rate: 1 };
      io.to(room.code).emit('yt.set', { v, hostUid: m.uid });
      persistState(room.code);
    });

    socket.on('yt.state', (p) => {
      const room = rooms.get(socket.data.room); const m = room?.members.get(socket.id);
      if (!room || !m) return;
      // کنترل ۱۰۰٪ دوسویه: هر عضو می‌تواند پخش یوتیوب را کنترل کند (محدودیت نرخ همان پایین اعمال می‌شود)
      if (!limits.check(`ytstate:${socket.id}`, 30, 6000)) return socket.emit('err', { code: 'rate' });
      const act = safeStr(p?.act, 8);
      room.yt.act = ['play', 'pause'].includes(act) ? act : room.yt.act;
      if (act === 'seek') room.yt.pos = clamp(p?.pos, 0, 24 * 3600);
      if (act === 'rate') room.yt.rate = clamp(p?.rate, 0.25, 2);
      io.to(room.code).emit('yt.state', { act, pos: clamp(p?.pos, 0, 24 * 3600), rate: room.yt.rate, by: m.uid });
    });

    socket.on('mv.set', (p) => {
      // بعد از پایان آپلود صدا زده می‌شود — فایل روی دیسک آماده است
      const room = rooms.get(socket.data.room); const m = room?.members.get(socket.id);
      if (!room || !m) return;
      const name = mvf.sanitizeName(safeStr(p?.file, 200));   // پاک‌سازی نام — کاربر هر نامی می‌فرستد، سرور نرمال می‌کند
      if (!name) return socket.emit('err', { code: 'badurl' });
      room.mv = { active: true, mode: 'server', hostUid: m.uid, name, file: name, size: clamp(p?.size, 0, 2.1e9), dur: clamp(p?.dur, 0, 24 * 3600), pos: 0, posAt: 0, act: 'pause', rate: 1, lastSeekBy: null, lastSeekAt: 0 };
      mvf.cleanupOthers(room.code, name);
      io.to(room.code).emit('mv.file', { url: `/mvfiles/${room.code}/${encodeURIComponent(name)}`, name, size: room.mv.size, dur: room.mv.dur, hostUid: m.uid, hostName: m.name });
      persistState(room.code);
    });

    socket.on('mv.local.set', (p) => {
      // فیلم لوکال — بدون آپلود: فایل روی دستگاهِ میزبان می‌ماند و بیننده‌ها با WebRTC مستقیم از او استریم می‌کنند
      const room = rooms.get(socket.data.room); const m = room?.members.get(socket.id);
      if (!room || !m) return;
      if (!limits.check(`mvlocal:${socket.id}`, 4, 10000)) return socket.emit('err', { code: 'rate' });
      const name = mvf.sanitizeName(safeStr(p?.file, 200));
      if (!name) return socket.emit('err', { code: 'badurl' });
      room.mv = { active: true, mode: 'local', hostUid: m.uid, name, file: '', size: clamp(p?.size, 0, 2.1e9), dur: clamp(p?.dur, 0, 24 * 3600), pos: 0, posAt: 0, act: 'pause', rate: 1, lastSeekBy: null, lastSeekAt: 0 };
      mvf.cleanupRoom(room.code);   // اگر فیلم سروری قبلی بود، فایلش پاک شود
      io.to(room.code).emit('mv.local.file', { name, size: room.mv.size, dur: room.mv.dur, hostUid: m.uid, hostName: m.name, hostSid: socket.id });
      persistState(room.code);
    });

    socket.on('mvp.want', () => {
      // بینندهٔ فیلم لوکال، میزبان را برای مذاکرهٔ WebRTC صدا می‌زند
      const room = rooms.get(socket.data.room); const m = room?.members.get(socket.id);
      if (!room || !m || !room.mv.active || room.mv.mode !== 'local' || !room.mv.hostUid) return;
      const host = [...room.members.entries()].find(([, mm]) => mm.uid === room.mv.hostUid);
      if (host && host[0] !== socket.id) io.to(host[0]).emit('mvp.need', { to: socket.id, uid: m.uid, name: m.name });
    });

    socket.on('mvp.sig', (p) => {
      // ریلهٔ سیگنالینگ فیلم لوکال — مثل rt.sig ولی هدف با socketId (میزبان/بیننده در لحظه)
      const room = rooms.get(socket.data.room); const m = room?.members.get(socket.id);
      if (!room || !m || !room.mv.active || room.mv.mode !== 'local') return;
      if (!limits.check(`mvpsig:${socket.id}`, 150, 10000)) return;
      const to = safeStr(p?.to, 40);
      if (!room.members.has(to)) return;
      const payload = JSON.stringify(p?.data || {}).slice(0, 16384);
      io.to(to).emit('mvp.sig', { from: m.uid, data: JSON.parse(payload) });
    });

    socket.on('mv.state', (p) => {
      // کنترل پخش برای همه باز است و ضربان همگام‌سازی از همه می‌آید — بدون اولویت ادمین
      const room = rooms.get(socket.data.room); const m = room?.members.get(socket.id);
      if (!room || !m || !room.mv.active) return;
      if (!limits.check(`mvstate:${socket.id}`, 40, 6000)) return socket.emit('err', { code: 'rate' });
      const act = safeStr(p?.act, 8);
      if (act === 'play') { room.mv.act = 'play'; room.mv.pos = clamp(p?.pos, 0, 24 * 3600); room.mv.posAt = Date.now(); }
      if (act === 'pause') { room.mv.act = 'pause'; room.mv.pos = clamp(p?.pos, 0, 24 * 3600); room.mv.posAt = 0; }
      if (act === 'seek') { room.mv.lastSeekBy = m.uid; room.mv.lastSeekAt = Date.now(); }
      if (act === 'seek' || act === 'sync') {
        // تا ۳ ثانیه بعد از سیک، گزارش ضربانِ نفرِ دیگر کهنه است — موقعیت مرجع را عقب نکش
        if (act === 'sync' && room.mv.lastSeekBy && room.mv.lastSeekBy !== m.uid && Date.now() - room.mv.lastSeekAt < 3000) return;
        room.mv.pos = clamp(p?.pos, 0, 24 * 3600);
        room.mv.posAt = Date.now();
        room.mv.rate = clamp(p?.rate, 0.25, 2);
      }
      if (act === 'rate') room.mv.rate = clamp(p?.rate, 0.25, 2);
      io.to(room.code).emit('mv.state', { act, pos: clamp(p?.pos, 0, 24 * 3600), rate: room.mv.rate, by: m.uid });
    });

    socket.on('mv.close', () => {
      const room = rooms.get(socket.data.room); const m = room?.members.get(socket.id);
      if (!room || !m) return;
      if (room.hostUid !== m.uid && room.mv.hostUid !== m.uid) return socket.emit('err', { code: 'forbidden' });
      room.mv = { active: false, mode: 'server', hostUid: null, name: '', file: '', size: 0, dur: 0, pos: 0, posAt: 0, act: 'pause', rate: 1, lastSeekBy: null, lastSeekAt: 0 };
      mvf.cleanupRoom(room.code);
      io.to(room.code).emit('mv.close');
      persistState(room.code);
    });

    socket.on('tt.move', (p) => {
      const room = rooms.get(socket.data.room); const m = room?.members.get(socket.id);
      if (!room || !m || m.side === 'spec') return;
      const i = clamp(p?.i, 0, 8) | 0;
      const t = room.tt;
      if (t.winner || t.cells[i] || t.turn !== m.side) return socket.emit('err', { code: 'badmove' });
      t.cells[i] = m.side;
      const L = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
      let won = null, line = null;
      for (const [a, b, c] of L) if (t.cells[a] && t.cells[a] === t.cells[b] && t.cells[a] === t.cells[c]) { won = t.cells[a]; line = [a, b, c]; break; }
      if (won) { t.winner = won; t.line = line; t.scores[won]++; }
      else if (t.cells.every((x) => x)) { t.winner = 'draw'; }
      else t.turn = t.turn === 'x' ? 'o' : 'x';
      io.to(room.code).emit('tt', { cells: t.cells, turn: t.turn, winner: t.winner, line: t.line, scores: t.scores });
      persistState(room.code);
    });

    socket.on('tt.reset', () => {
      const room = rooms.get(socket.data.room); const m = room?.members.get(socket.id);
      if (!room || !m) return;
      if (room.hostUid !== m.uid && room.controller !== m.uid) return socket.emit('err', { code: 'forbidden' });
      room.tt.cells = Array(9).fill(''); room.tt.turn = 'x'; room.tt.winner = null; room.tt.line = null;
      io.to(room.code).emit('tt', { cells: room.tt.cells, turn: room.tt.turn, winner: null, line: null, scores: room.tt.scores });
      persistState(room.code);
    });

    socket.on('ctl.lock', (p) => {
      const room = rooms.get(socket.data.room); const m = room?.members.get(socket.id);
      if (!room || !m) return socket.emit('err', { code: 'forbidden' });
      // ادعای کنترل برای همه باز است — میزبان همیشه می‌تواند بازنویسی کند
      if (room.controller && room.controller !== m.uid && room.hostUid !== m.uid) {
        return socket.emit('err', { code: 'locked' });
      }
      room.controller = p?.target && room.members.size ? safeStr(p.target, 20) : null;
      io.to(room.code).emit('ctl.lock', { controller: room.controller });
    });

    socket.on('kick', (p) => {
      const room = rooms.get(socket.data.room); const m = room?.members.get(socket.id);
      if (!room || !m || room.hostUid !== m.uid) return socket.emit('err', { code: 'forbidden' });
      const entry = [...room.members.entries()].find(([, mm]) => mm.uid === safeStr(p?.uid, 24));
      if (!entry) return;
      const list = bans.get(room.code) || new Map();
      list.set(entry[0].handshake?.address || entry[0].id, Date.now() + 300000);
      bans.set(room.code, list);
      io.to(room.code).emit('sys', { msg: `${entry[1].name} توسط میزبان حذف شد`, ts: Date.now() });
      io.to(entry[0]).emit('kicked');
      entry[0].disconnect(true);
      room.members.delete(entry[0]);
      for (const s of ['p1', 'p2']) if (room.rps.seats[s] === entry[1].uid) { room.rps.seats[s] = null; room.rps.picks[s] = null; room.rps.phase = 'pick'; }
      io.to(room.code).emit('roster', { list: roster(room), hostUid: room.hostUid, controller: room.controller });
      if (entry[1].inCall) io.to(room.code).emit('rtc.roster', { list: callList(room) });
      io.to(room.code).emit('rps', rpsView(room));
    });

    socket.on('rt.sig', (p) => {
      const room = rooms.get(socket.data.room); const m = room?.members.get(socket.id);
      if (!room || !m) return;
      if (!limits.check(`sig:${socket.id}`, 150, 10000)) return;
      const target = [...room.members.entries()].find(([, mm]) => mm.uid === safeStr(p?.to, 24));
      if (!target) return;
      const payload = JSON.stringify(p?.data || {}).slice(0, 16384);
      io.to(target[0]).emit('rt.sig', { from: m.uid, data: JSON.parse(payload) });
    });

    /* ═══ تم اتاق (سفارشی‌سازی به سبک Kosmi) — فقط میزبان ═══ */
    socket.on('room.theme', (p) => {
      const room = rooms.get(socket.data.room); const m = room?.members.get(socket.id);
      if (!room || !m) return;
      if (room.hostUid !== m.uid) return socket.emit('err', { code: 'forbidden' });
      const t = safeStr(p?.theme, 20);
      if (!THEMES.includes(t)) return socket.emit('err', { code: 'badtheme' });
      room.theme = t;
      io.to(room.code).emit('room.theme', { theme: t });
      persistState(room.code);
    });

    /* ═══ صدا و تصویر — حضور در تماس؛ سیگنالینگ از rt.sig رله می‌شود ═══ */
    socket.on('rtc.join', (p) => {
      const room = rooms.get(socket.data.room); const m = room?.members.get(socket.id);
      if (!room || !m) return;
      if (!limits.check(`rtcjoin:${socket.id}`, 8, 60000)) return socket.emit('err', { code: 'rate' });
      if (!m.inCall && callList(room).length >= 10) return socket.emit('err', { code: 'callfull' });
      m.inCall = true;
      m.mic = p?.mic !== false; m.cam = !!p?.cam; m.screen = false;
      io.to(room.code).emit('rtc.roster', { list: callList(room) });
      io.to(room.code).emit('roster', { list: roster(room), hostUid: room.hostUid, controller: room.controller });
    });

    socket.on('rtc.leave', () => {
      const room = rooms.get(socket.data.room); const m = room?.members.get(socket.id);
      if (!room || !m || !m.inCall) return;
      m.inCall = false; m.mic = false; m.cam = false; m.screen = false;
      io.to(room.code).emit('rtc.roster', { list: callList(room) });
      io.to(room.code).emit('roster', { list: roster(room), hostUid: room.hostUid, controller: room.controller });
    });

    socket.on('rtc.state', (p) => {
      const room = rooms.get(socket.data.room); const m = room?.members.get(socket.id);
      if (!room || !m || !m.inCall) return;
      if (!limits.check(`rtcstate:${socket.id}`, 30, 10000)) return;
      if ('mic' in (p || {})) m.mic = !!p.mic;
      if ('cam' in (p || {})) m.cam = !!p.cam;
      if ('screen' in (p || {})) m.screen = !!p.screen;
      io.to(room.code).emit('rtc.state', { uid: m.uid, mic: m.mic, cam: m.cam, screen: m.screen });
    });

    /* ═══ سنگ‌کاغذقیچی — دومین بازی ماژولار؛ انتخاب‌ها مخفی تا هر دو بزنند ═══ */
    socket.on('rps.seat', (p) => {
      const room = rooms.get(socket.data.room); const m = room?.members.get(socket.id);
      if (!room || !m) return;
      if (!limits.check(`rps:${socket.id}`, 20, 10000)) return;
      const seat = p?.seat === null || p?.seat === undefined ? null : safeStr(p.seat, 3);
      if (seat !== null && !['p1', 'p2'].includes(seat)) return socket.emit('err', { code: 'badmove' });
      if (seat === null) {
        for (const s of ['p1', 'p2']) if (room.rps.seats[s] === m.uid) { room.rps.seats[s] = null; room.rps.picks[s] = null; }
      } else {
        for (const s of ['p1', 'p2']) if (room.rps.seats[s] === m.uid) { room.rps.seats[s] = null; room.rps.picks[s] = null; }
        if (room.rps.seats[seat] && room.rps.seats[seat] !== m.uid) return socket.emit('err', { code: 'seatbusy' });
        room.rps.seats[seat] = m.uid;
      }
      room.rps.phase = 'pick';
      io.to(room.code).emit('rps', rpsView(room));
      persistState(room.code);
    });

    socket.on('rps.pick', (p) => {
      const room = rooms.get(socket.data.room); const m = room?.members.get(socket.id);
      if (!room || !m) return;
      if (!limits.check(`rps:${socket.id}`, 20, 10000)) return;
      const seat = room.rps.seats.p1 === m.uid ? 'p1' : room.rps.seats.p2 === m.uid ? 'p2' : null;
      if (!seat) return socket.emit('err', { code: 'noseat' });
      if (room.rps.phase !== 'pick') return socket.emit('err', { code: 'badmove' });
      const pick = safeStr(p?.pick, 2);
      if (!['r', 'p', 's'].includes(pick)) return socket.emit('err', { code: 'badmove' });
      room.rps.picks[seat] = pick;
      if (room.rps.picks.p1 && room.rps.picks.p2) {
        const a = room.rps.picks.p1, b = room.rps.picks.p2;
        const beats = { r: 's', p: 'r', s: 'p' };
        room.rps.phase = 'reveal';
        if (a === b) room.rps.last = { a, b, result: 'draw' };
        else if (beats[a] === b) { room.rps.wins.p1++; room.rps.last = { a, b, result: 'p1' }; }
        else { room.rps.wins.p2++; room.rps.last = { a, b, result: 'p2' }; }
      }
      io.to(room.code).emit('rps', rpsView(room));
      persistState(room.code);
    });

    socket.on('rps.reset', (p) => {
      const room = rooms.get(socket.data.room); const m = room?.members.get(socket.id);
      if (!room || !m) return;
      if (p?.newmatch) { room.rps.wins = { p1: 0, p2: 0 }; room.rps.last = null; }
      room.rps.picks = { p1: null, p2: null };
      room.rps.phase = 'pick';
      io.to(room.code).emit('rps', rpsView(room));
      persistState(room.code);
    });

    socket.on('sync', (_p, ack) => {
      const room = rooms.get(socket.data.room); const m = room?.members.get(socket.id);
      if (!room || !m) return ack?.({ ok: false });
      ack?.({ ok: true, you: { uid: m.uid, name: m.name, role: m.role, side: m.side }, state: stateSnapshot(room) });
    });

    socket.on('disconnect', () => {
      const code = socket.data.room;
      const room = rooms.get(code);
      if (room) leaveRoom(socket, room);
    });
  });

  return { rooms, bans };
}

module.exports = { install, newRoom, randCode };
