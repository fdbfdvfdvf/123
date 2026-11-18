/* تست ویژگی‌های جدید: لابی عمومی، تم، RPS، حضور تماس (rtc.roster) — روی سرور واقعی اجرا می‌شود
   استفاده: node test/features.js https://... */
const BASE = process.argv[2] || 'http://localhost:3121';
const { io } = require('socket.io-client');
let pass = 0, fail = 0;
const check = (n, c) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const connect = () => new Promise((res, rej) => { const s = io(BASE, { transports: ['websocket'] }); s.on('connect', () => res(s)); s.on('connect_error', rej); });
const join = (s, code, name, pass) => new Promise((res, rej) => { s.emit('join', { code, name, pass }, (r) => r?.ok ? res(r) : rej(new Error('join: ' + JSON.stringify(r)))); setTimeout(() => rej(new Error('join timeout')), 8000); });
const once = (s, ev) => new Promise((res) => s.once(ev, res));

(async () => {
  const name = 'feat-' + Math.random().toString(36).slice(2, 6);

  /* ─── لابی: اتاق عمومی با نام ─── */
  const cr = await (await fetch(BASE + '/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'tester', roomName: 'لابی تست', pass: '' }) })).json();
  check('ساخت اتاق با نام', cr.ok && cr.name === 'لابی تست');
  const info = await (await fetch(BASE + '/api/rooms/' + cr.code)).json();
  check('GET اتاق شامل name', info.ok && info.name === 'لابی تست' && info.hasPass === false);
  const A = await connect();
  const jA = await join(A, cr.code, 'میزبان');
  check('A میزبان شد', jA.you.role === 'host');
  const lobby1 = await (await fetch(BASE + '/api/rooms')).json();
  const mine = lobby1.rooms.find((x) => x.code === cr.code);
  check('لابی اتاق عمومی را نشان می‌دهد', !!mine && mine.online === 1 && mine.name === 'لابی تست');

  /* ─── اتاق رمزدار نباید در لابی باشد (با سوکت موقت) ─── */
  const cp = await (await fetch(BASE + '/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'tester', roomName: 'سری', pass: 'x1234' }) })).json();
  const Ctmp = await connect();
  await join(Ctmp, cp.code, 'دومی', 'x1234');
  const lobby2 = await (await fetch(BASE + '/api/rooms')).json();
  check('اتاق رمزدار از لابی پنهان است', !lobby2.rooms.some((x) => x.code === cp.code));
  Ctmp.disconnect();

  /* ─── B به اتاق A می‌آید — از این‌جا به بعد هم‌اتاق‌اند ─── */
  const B = await connect();
  const jB = await join(B, cr.code, 'دومی');
  check('B مهمان است', jB.you.role === 'guest');

  /* ─── تم: میزبان عوض می‌کند، بقیه می‌گیرند؛ مهمان حق ندارد ─── */
  const themeP = once(A, 'room.theme');
  B.emit('room.theme', { theme: 'cafe' });
  const denied = await Promise.race([themeP.then(() => 'got'), sleep(800).then(() => 'none')]);
  check('مهمان نمی‌تواند تم عوض کند', denied === 'none');
  const themeP2 = once(A, 'room.theme');
  A.emit('room.theme', { theme: 'cafe' });
  const th = await Promise.race([themeP2, sleep(2000).then(() => null)]);
  check('میزبان تم را عوض کرد و broadcast شد', th && th.theme === 'cafe');

  /* ─── RPS: صندلی، انتخاب مخفی، reveal، امتیاز ─── */
  const rpsP = once(B, 'rps');
  A.emit('rps.seat', { seat: 'p1' });
  let v = await Promise.race([rpsP, sleep(2000).then(() => null)]);
  check('نشستن روی صندلی broadcast شد', v && v.seats.p1.picked === false && v.seats.p1.uid);
  B.emit('rps.seat', { seat: 'p2' });
  await sleep(300);
  B.emit('rps.pick', { pick: 'r' });
  await sleep(300);
  const vMid = S => null; // جای‌نگهدار
  // در فاز pick، فاش نشدن انتخاب‌ها
  const mid = new Promise((res) => A.once('rps', res));
  A.emit('rps.pick', { pick: 's' });
  v = await Promise.race([mid, sleep(2000).then(() => null)]);
  check('پس از هر دو انتخاب → reveal', v && v.phase === 'reveal' && v.picks);
  check('نتیجه درست: کاغذ(؟ نه) — سنگ r بر قیچی s می‌بازد → برد p2', v && v.last && v.last.result === 'p2' && v.wins.p2 === 1);
  const masked = new Promise((res) => A.once('rps', res));
  A.emit('rps.reset', {});
  v = await Promise.race([masked, sleep(2000).then(() => null)]);
  check('دست بعدی: فاز pick و انتخاب‌ها مخفی', v && v.phase === 'pick' && v.picks === null && v.wins.p2 === 1);
  const third = await connect();
  await join(third, cr.code, 'سومی');
  third.emit('rps.seat', { seat: 'p1' });
  const busy = await new Promise((res) => { third.once('err', (e) => res(e.code)); setTimeout(() => res(null), 1500); });
  check('صندلی اشغال → خطای seatbusy', busy === 'seatbusy');
  third.disconnect();

  /* ─── حضور تماس: rtc.roster ─── */
  const rosterP = new Promise((res) => B.once('rtc.roster', res));
  A.emit('rtc.join', { mic: true, cam: false });
  const rr = await Promise.race([rosterP, sleep(2000).then(() => null)]);
  check('rtc.roster شامل A', rr && rr.list.length === 1 && rr.list[0].name === 'میزبان');
  const rosterP2 = new Promise((res) => A.once('rtc.roster', res));
  B.emit('rtc.join', { mic: true, cam: true });
  const rr2 = await Promise.race([rosterP2, sleep(2000).then(() => null)]);
  check('دو نفر در تماس', rr2 && rr2.list.length === 2);
  const rr3 = await new Promise((res) => {
    const t = setTimeout(() => res(null), 3000);
    B.on('rtc.roster', (p) => {   // broadcastهای معوق (مثل نسخهٔ join خودش) را رد کن — فقط لیست بدون «دومی» معتبر است
      if (!p.list.some((x) => x.name === 'دومی')) { clearTimeout(t); B.off('rtc.roster'); res(p); }
    });
    B.emit('rtc.leave');
  });
  check('خروج از تماس → roster به‌روز', rr3 && rr3.list.length === 1);

  console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
  [A, B].forEach((s) => s.disconnect());
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
