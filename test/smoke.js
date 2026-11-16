/**
 * اسموک‌تست پلتفرم Together — دو کلاینت واقعی Socket.IO + ریستارت سرور
 * اجرا: node test/smoke.js
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { io } = require('socket.io-client');

const PORT = 3122;
const URL_ = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync('/tmp/tg-smoke-');
let server = null;
const results = [];
function report(name, ok, note = '') {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${note ? ' — ' + note : ''}`);
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function waitEvent(sock, ev, timeout = 8000, pred = () => true) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout: ' + ev)), timeout);
    const h = (p) => { if (pred(p)) { clearTimeout(t); sock.off(ev, h); res(p); } };
    sock.on(ev, h);
  });
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const get = (url) => fetch(url).then((r) => r.json());
function client() { return io(URL_, { transports: ['websocket'], reconnection: false }); }
function join(sock, code, name, pass) {
  return new Promise((res, rej) => {
    sock.emit('join', { code, name, pass: pass || '' }, (r) => r?.ok ? res(r) : rej(new Error(r?.err || 'join fail')));
  });
}

function startServer() {
  server = spawn('node', ['server/index.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DATA_DIR },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write('[srv] ' + d));
  server.stderr.on('data', (d) => process.stdout.write('[srv!] ' + d));
  return new Promise(async (res) => {
    for (let i = 0; i < 60; i++) {
      try { const r = await get(`${URL_}/api/health`); if (r.ok) return res(); } catch {}
      await sleep(250);
    }
    throw new Error('server did not start');
  });
}
function stopServer() {
  return new Promise((res) => {
    if (!server) return res();
    server.on('exit', () => res());
    server.kill('SIGTERM');
    setTimeout(res, 4000);
  });
}

(async () => {
  try {
    await startServer();
    console.log('— سرور بالا آمد —');

    /* REST */
    const h = await get(`${URL_}/api/health`);
    report('health endpoint', h.ok === true && ['postgres', 'file'].includes(h.storage), 'storage=' + h.storage);
    const cr = await post(`${URL_}/api/rooms`, { name: 'smoke' });
    report('ساخت اتاق از REST', cr.ok && /^[A-Z0-9]{5}$/.test(cr.code), 'code=' + cr.code);
    const CODE = cr.code;
    const info = await get(`${URL_}/api/rooms/${CODE}`);
    report('اطلاعات اتاق', info.ok && info.code === CODE && info.hasPass === false && info.online === 0);

    /* اتاق رمزدار */
    const cr2 = await post(`${URL_}/api/rooms`, { name: 'locked', pass: 's3cret' });
    const S2 = client();
    let joinErr = null;
    S2.emit('join', { code: cr2.code, name: 'بی‌رمز', pass: 'wrong' }, (r) => { joinErr = r; });
    await sleep(500);
    report('رمز اشتباه رد می‌شود', joinErr && joinErr.ok === false);
    const ok2 = await join(S2, cr2.code, 'رمزدار', 's3cret');
    report('ورود با رمز درست', ok2.you.role === 'host');
    S2.disconnect();

    /* دو کلاینت اصلی */
    const A = client(), B = client();
    const wA = await join(A, CODE, 'علی');
    report('A وارد شد (میزبان)', wA.you.role === 'host' && wA.state.chat.length === 0);
    const rosterB = waitEvent(A, 'roster', 6000, (p) => p.list.length === 2);
    const wB = await join(B, CODE, 'سارا');
    await rosterB;
    report('B وارد شد و roster در A به‌روز شد', wB.you.role === 'guest' && wB.you.side !== 'spec', 'side=' + wB.you.side);

    /* چت دوطرفه */
    const chatB = waitEvent(B, 'chat', 6000, (m) => m.body === 'سلام از علی');
    const chatA = waitEvent(A, 'chat', 6000, (m) => m.body === 'سلام سارا!');
    A.emit('chat', { body: 'سلام از علی' });
    B.emit('chat', { body: 'سلام سارا!' });
    await Promise.all([chatB, chatA]);
    report('چت دوطرفه', true);

    /* تخته */
    const strokeB = waitEvent(B, 'stroke', 6000, (p) => p.d?.p?.length === 4);
    A.emit('stroke', { d: { id: 's1', t: 'pen', c: '#fff', w: 4, p: [0.1, 0.1, 0.4, 0.4] } });
    await strokeB;
    report('استروک از A به B', true);
    const undB = waitEvent(B, 'undost', 6000, (p) => p.id === 's1');
    A.emit('undost', { id: 's1' });
    await undB;
    report('برگشت استروک', true);

    /* هم‌مرورگری */
    let errGot = null;
    A.once('err', (p) => { errGot = p.code; });
    A.emit('cov.nav', { url: 'javascript:alert(1)' });
    await sleep(400);
    report('URL مخرب رد می‌شود', errGot === 'badurl', 'err=' + errGot);
    const navB = waitEvent(B, 'cov.nav', 6000, (p) => p.url.includes('example.com'));
    A.emit('cov.nav', { url: 'https://example.com/page1' });
    await navB;
    report('ناوبری مشترک', true);

    /* یوتیوب */
    const ytB = waitEvent(B, 'yt.set', 6000, (p) => p.v === 'dQw4w9WgXcQ');
    A.emit('yt.set', { v: 'dQw4w9WgXcQ' });
    await ytB;
    report('تنظیم یوتیوب', true);
    const ytStateB = waitEvent(B, 'yt.state', 6000, (p) => p.act === 'play');
    A.emit('yt.state', { act: 'play', pos: 3.5 });
    await ytStateB;
    report('فرمان پخش یوتیوب', true);

    /* فیلم مشترک (state) */
    const mvB = waitEvent(B, 'mv.open', 6000, (p) => p.hostName === 'علی');
    A.emit('mv.open', { name: 'film.mp4', size: 123456, dur: 120 });
    await mvB;
    report('فیلم مشترک: اعلام و صاحب فیلم', true);
    const mvLockB = waitEvent(B, 'mv.lock', 6000, (p) => p.on === true);
    A.emit('mv.lock', { on: true });
    await mvLockB;
    report('قفل کنترل فیلم', true);
    let mvLockErr = null;
    B.once('err', (p) => { mvLockErr = p.code; });
    B.emit('mv.cmd', { act: 'pause' });
    await sleep(400);
    report('با قفل فعال، کنترل B رد می‌شود', mvLockErr === 'locked', 'err=' + mvLockErr);
    const mvUnlockB = waitEvent(B, 'mv.lock', 6000, (p) => p.on === false);
    A.emit('mv.lock', { on: false });
    await mvUnlockB;
    const mvCmdA = waitEvent(A, 'mv.cmd', 6000, (p) => p.act === 'pause');
    B.emit('mv.cmd', { act: 'pause' });
    await mvCmdA;
    report('کنترل فیلم توسط B به A می‌رسد', true);
    const mvCloseB = waitEvent(B, 'mv.close', 6000);
    A.emit('mv.close');
    await mvCloseB;
    report('پایان فیلم مشترک', true);

    /* تیک‌تاک‌تو سرور-محور */
    A.emit('tt.move', { i: 0 });
    await sleep(300);
    let moveErr = null;
    B.once('err', (p) => { moveErr = p.code; });
    B.emit('tt.move', { i: 0 });   // خانهٔ پرشده → رد
    await sleep(300);
    report('حرکت غیرقانونی رد می‌شود', moveErr === 'badmove', 'err=' + moveErr);
    B.emit('tt.move', { i: 4 }); await waitEvent(B, 'tt', 4000, (p) => p.cells[4] === 'o');
    A.emit('tt.move', { i: 1 }); await waitEvent(A, 'tt', 4000, (p) => p.cells[1] === 'x');
    B.emit('tt.move', { i: 5 }); await waitEvent(B, 'tt', 4000, (p) => p.cells[5] === 'o');
    A.emit('tt.move', { i: 2 });
    const ttWin = await waitEvent(A, 'tt', 4000, (p) => p.winner === 'x');
    report('برد ✕ روی سرور اعتبارسنجی شد', ttWin.scores.x === 1);

    /* محدودیت نرخ */
    let rateErr = false;
    A.on('err', (p) => { if (p.code === 'rate') rateErr = true; });
    for (let i = 0; i < 20; i++) A.emit('chat', { body: 'اسپم ' + i });
    await sleep(700);
    report('محدودیت نرخ چت', rateErr === true);

    /* قفل کنترل انحصاری */
    const ctlB = waitEvent(B, 'ctl.lock', 6000, (p) => p.controller === wB.you.uid);
    A.emit('ctl.lock', { target: wB.you.uid });
    await ctlB;
    report('قفل کنترل به B', true);
    const rel0 = waitEvent(B, 'ctl.lock', 6000, (p) => p.controller === null);
    A.emit('ctl.lock', { target: null });
    await rel0;

    /* کنترل ۱۰۰٪ دوسویه */
    const claimB = waitEvent(B, 'ctl.lock', 6000, (p) => p.controller === wB.you.uid);
    B.emit('ctl.lock', { target: wB.you.uid });
    await claimB;
    report('مهمان کنترل را ادعا می‌کند', true);
    const C = client();
    const wC = await join(C, CODE, 'کاربر3');
    let stealErr = false; C.on('err', (p) => { if (p?.code === 'locked') stealErr = true; });
    C.emit('ctl.lock', { target: wC.you.uid });
    await sleep(700);
    report('ادعای کنترلِ گرفته‌شده رد می‌شود', stealErr === true);
    const relB = waitEvent(B, 'ctl.lock', 6000, (p) => p.controller === null);
    A.emit('ctl.lock', { target: null });
    await relB;
    report('میزبان کنترل را آزاد می‌کند', true);
    const ytGuest = waitEvent(B, 'yt.state', 6000, (p) => p.act === 'play' && p.by === wB.you.uid);
    B.emit('yt.state', { act: 'play', pos: 5 });
    await ytGuest;
    report('کنترل یوتیوب توسط مهمان', true);
    const mvOpenA = waitEvent(A, 'mv.open', 6000, (p) => p.hostUid === wB.you.uid);
    B.emit('mv.open', { name: 'فیلم مهمان.mp4', size: 100, dur: 60 });
    await mvOpenA;
    report('مهمان فیلم را باز می‌کند', true);
    const mvCloseA = waitEvent(A, 'mv.close', 6000);
    A.emit('mv.close');
    await mvCloseA;
    report('میزبان پخش فیلم را پایان می‌دهد', true);
    C.disconnect();
    await sleep(500);

    /* پایداری بعد از ریستارت */
    await sleep(6200);   // خروج از پنجرهٔ محدودیت نرخ چت
    A.emit('chat', { body: 'پیام ماندگار' });
    A.emit('stroke', { d: { id: 's2', t: 'pen', c: '#f00', w: 4, p: [0.2, 0.2, 0.6, 0.6] } });
    await sleep(3800);   // فاصله تا flush حالت/پیام‌ها
    A.disconnect(); B.disconnect();
    await stopServer();
    report('توقف سرور برای تست پایداری', true);
    await startServer();
    const A2 = client();
    const w2 = await join(A2, CODE, 'علی2');
    report('اتاق بعد از ریستارت زنده است', w2.ok === true && w2.state.chat.length > 0, `chat=${w2.state.chat.length}`);
    report('تاریخچهٔ چت ماندگار', w2.state.chat.some((m) => m.body === 'پیام ماندگار'));
    report('استروک ماندگار', (w2.state.strokes || []).length === 1);
    report('امتیاز بازی ماندگار', w2.state.tt.scores.x === 1);
    A2.disconnect();

    const passCount = results.filter((r) => r.ok).length;
    console.log(`\nPASS: ${passCount} | FAIL: ${results.length - passCount}`);
    process.exit(passCount === results.length ? 0 : 1);
  } catch (e) {
    console.error('❌ CRASH:', e.message);
    await stopServer();
    process.exit(2);
  }
})();
