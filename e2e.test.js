/**
 * تست دو-کلاینتی واقعی Together — دو مرورگر مجزا با دستگاه رسانه‌ای فیک
 * اجرا: node /home/z/my-project/scripts/together_test.js
 */
const { chromium } = require('playwright');
const APP = 'file:///home/z/my-project/download/together/index.html';
const SHOTS = '/tmp/together-shots';
require('fs').mkdirSync(SHOTS, { recursive: true });

const results = [];
let pageErrors = [];
function report(name, status, note = '') {
  results.push({ name, status, note });
  console.log(`${status === 'PASS' ? '✅' : status === 'WARN' ? '🟡' : '❌'} ${name}${note ? ' — ' + note : ''}`);
}
async function step(name, fn) {
  try { const n = await fn(); report(name, 'PASS', n || ''); return true; }
  catch (e) { report(name, 'FAIL', String(e.message || e).slice(0, 160)); return false; }
}
async function warn(name, fn) {
  try { const n = await fn(); report(name, 'PASS', n || ''); return true; }
  catch (e) { report(name, 'WARN', String(e.message || e).slice(0, 160)); return false; }
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
  });
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 820 }, permissions: ['camera', 'microphone'] });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 820 }, permissions: ['camera', 'microphone'] });
  const A = await ctxA.newPage(), B = await ctxB.newPage();
  for (const p of [A, B]) p.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));

  /* ---------- ۱) ساخت اتاق توسط میزبان ---------- */
  await A.goto(APP);
  await A.click('#btnCreate');
  await A.fill('#crName', 'علی');
  await step('میزبان اتاق ساخت', async () => { await A.click('#crGo'); await A.waitForSelector('#room.open', { timeout: 8000 }); const c = await A.textContent('#roomCodeTxt'); if (!c || c === '-----') throw Error('no code'); return 'کد: ' + c; });
  const CODE = (await A.textContent('#roomCodeTxt')).trim();

  /* ---------- ۲) ورود مهمان ---------- */
  await B.goto(APP);
  await B.click('#btnJoin');
  await B.fill('#jnCode', CODE);
  await B.fill('#jnName', 'سارا');
  await step('مهمان وارد اتاق شد', async () => { await B.click('#jnGo'); await B.waitForSelector('#room.open', { timeout: 15000 }); await B.waitForFunction(() => document.querySelectorAll('#presenceStack .pava').length === 2, null, { timeout: 15000 }); return 'کد ' + CODE; });
  await warn('حضور در سمت میزبان هم ۲ نفر', async () => { await A.waitForFunction(() => document.querySelectorAll('#presenceStack .pava').length === 2, null, { timeout: 8000 }); });

  /* ---------- ۳) چت دوطرفه ---------- */
  await step('چت میزبان → مهمان', async () => {
    await A.fill('#chatInput', 'سلام از علی');
    await A.click('#chatSend');
    await B.waitForSelector('.cmsg:has-text("سلام از علی")', { timeout: 8000 });
  });
  await step('چت مهمان → میزبان', async () => {
    await B.fill('#chatInput', 'سلام از سارا');
    await B.click('#chatSend');
    await A.waitForSelector('.cmsg:has-text("سلام از سارا")', { timeout: 8000 });
  });
  await step('اعلان ورود مهمان در چت میزبان', async () => {
    await A.waitForSelector('.csy:has-text("سارا")', { timeout: 5000 });
  });

  /* ---------- ۴) تخته نقاشی مشترک ---------- */
  await step('نقاشی مهمان روی تخته میزبان دیده می‌شود', async () => {
    await B.click('#stageTabs button[data-tab=board]');
    await B.waitForTimeout(400);
    const box = await B.locator('#board').boundingBox();
    await B.mouse.move(box.x + box.width * .3, box.y + box.height * .4);
    await B.mouse.down();
    for (let i = 0; i < 12; i++) await B.mouse.move(box.x + box.width * (.3 + i * .04), box.y + box.height * (.4 + i * .02));
    await B.mouse.up();
    await A.click('#stageTabs button[data-tab=board]');   // میزبان هم تخته را باز می‌کند تا بوم اندازه بگیرد
    await A.waitForTimeout(1200);
    const nonBg = await A.evaluate(() => {
      const c = document.querySelector('#board'), ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 40) if (Math.abs(d[i] - 14) + Math.abs(d[i + 1] - 10) + Math.abs(d[i + 2] - 28) > 30) n++;
      return n;
    });
    if (nonBg < 3) throw Error('بوم میزبان خالی است');
    return nonBg + ' پیکسل غیرزمینه';
  });
  await step('برگشت (undo) مهمان روی تخته میزبان', async () => {
    await B.click('#undoBtn');
    await A.waitForTimeout(900);
    const nonBg = await A.evaluate(() => {
      const c = document.querySelector('#board'), ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 40) if (Math.abs(d[i] - 14) + Math.abs(d[i + 1] - 10) + Math.abs(d[i + 2] - 28) > 30) n++;
      return n;
    });
    if (nonBg > 2) throw Error('خط پاک نشد (' + nonBg + ')');
  });

  /* ---------- ۵) تیک‌تک‌تو ---------- */
  await step('تیک‌تک‌تو: برد ✕ برای میزبان و سینک برنده در مهمان', async () => {
    await A.click('#stageTabs button[data-tab=game]');
    await B.click('#stageTabs button[data-tab=game]');
    await A.waitForTimeout(300);
    await A.click('#ttBoard button[data-i="0"]');
    await B.waitForTimeout(400);
    await B.click('#ttBoard button[data-i="3"]');
    await A.waitForTimeout(400);
    await A.click('#ttBoard button[data-i="1"]');
    await B.waitForTimeout(400);
    await B.click('#ttBoard button[data-i="4"]');
    await A.waitForTimeout(400);
    await A.click('#ttBoard button[data-i="2"]');
    await B.waitForSelector('#ttBoard button[data-i="2"].x', { timeout: 8000 });
    await B.waitForFunction(() => /برنده|Winner/.test(document.querySelector('#ttTurn').textContent), null, { timeout: 8000 });
    return await B.textContent('#ttTurn');
  });

  /* ---------- ۶) کو-ویو مشترک ---------- */
  await step('ناوبری کو-ویو از میزبان به مهمان', async () => {
    await A.click('#stageTabs button[data-tab=coview]');
    await B.click('#stageTabs button[data-tab=coview]');
    await A.fill('#covUrl', 'https://example.com');
    await A.click('#covGo');
    await B.waitForFunction(() => { const f = document.querySelector('#covFrame'); return !f.classList.contains('hide') && f.src.includes('example.com'); }, null, { timeout: 12000 });
  });

  /* ---------- ۶.۵) فیلم مشترک از حافظه (استریم P2P + کنترل دوطرفه) ---------- */
  const SAMPLE = require('fs').readFileSync('/tmp/together-sample.webm');
  await step('فیلم مشترک: استریم از میزبان به مهمان', async () => {
    await A.click('#stageTabs button[data-tab=movie]');
    await B.click('#stageTabs button[data-tab=movie]');
    await A.setInputFiles('#mvFileIn', { name: 'sample.webm', mimeType: 'video/webm', buffer: SAMPLE });
    await A.waitForFunction(() => document.querySelector('#mvVideo').classList.contains('on') && !document.querySelector('#mvVideo').paused, null, { timeout: 15000 });
    await B.waitForFunction(() => document.querySelector('#mvVideo').classList.contains('on') && (document.querySelector('#mvVideo').videoWidth || 0) > 0, null, { timeout: 25000 });
    return 'فریم ویدیو در سمت مهمان دریافت شد';
  });
  await step('فیلم مشترک: توقف توسط مهمان روی میزبان اعمال می‌شود', async () => {
    await B.click('#mvPause');
    await A.waitForFunction(() => document.querySelector('#mvVideo').paused === true, null, { timeout: 8000 });
  });
  await step('فیلم مشترک: پخش مجدد توسط مهمان', async () => {
    await B.click('#mvPlay');
    await A.waitForFunction(() => document.querySelector('#mvVideo').paused === false, null, { timeout: 8000 });
  });
  await step('فیلم مشترک: سیک ۵۰٪ توسط مهمان', async () => {
    await B.evaluate(() => { const s = document.querySelector('#mvSeek'); s.value = 50; s.dispatchEvent(new Event('change')); });
    await A.waitForFunction(() => document.querySelector('#mvVideo').currentTime > 2, null, { timeout: 8000 });
    const t = await A.evaluate(() => document.querySelector('#mvVideo').currentTime.toFixed(1));
    return ' currentTime=' + t;
  });
  await step('فیلم مشترک: پایان پخش توسط فرستنده → برگشت جای‌نگه‌دار در مهمان', async () => {
    await A.click('#mvEject');
    await B.waitForFunction(() => !document.querySelector('#mvPh').classList.contains('hide'), null, { timeout: 8000 });
  });

  /* ---------- ۷) واتچ پارتی یوتیوب ---------- */
  await warn('واتچ پارتی: لود یوتیوب در هر دو', async () => {
    await A.click('#stageTabs button[data-tab=watch]');
    await B.click('#stageTabs button[data-tab=watch]');
    await A.fill('#ytUrl', 'https://www.youtube.com/watch?v=jNQXAC9IVRw');
    await A.click('#ytGo');
    for (let i = 0; i < 15; i++) {
      await A.waitForTimeout(2000);
      const st = {};
      for (const [nm, pg] of [['A', A], ['B', B]]) st[nm] = await pg.evaluate(() => ({
        api: !!(window.YT && window.YT.Player), ifr: !!document.querySelector('#ytWrap iframe'),
      }));
      if (st.A.ifr && st.B.ifr) return 'player در دو طرف ساخته شد';
      if (i === 14) throw Error('وضعیت: ' + JSON.stringify(st));
    }
  });

  /* ---------- ۸) تماس تصویری (دستگاه فیک) ---------- */
  await warn('تماس تصویری mesh با دو دستگاه فیک', async () => {
    await A.click('#micBtn');
    await B.click('#micBtn');
    await A.waitForFunction(() => document.querySelectorAll('#callStrip .vidBox:not([data-pid=SELF])').length >= 1, null, { timeout: 20000 });
    await B.waitForFunction(() => document.querySelectorAll('#callStrip .vidBox:not([data-pid=SELF])').length >= 1, null, { timeout: 20000 });
    return 'ویدیوی طرف مقابل در هر دو سمت';
  });

  /* ---------- ۹) انتقال فایل ---------- */
  await step('فایل از میزبان به مهمان (P2P)', async () => {
    await A.click('#stageTabs button[data-tab=coview]');
    await B.click('#stageTabs button[data-tab=coview]');
    const buf = Buffer.from('PNGDATA-' + 'x'.repeat(3000));
    await A.setInputFiles('#chatFileIn', { name: 'test.txt', mimeType: 'text/plain', buffer: buf });
    await B.waitForSelector(`.cmsg.file:has-text("test.txt")`, { timeout: 10000 });
    await B.waitForFunction(() => { const el = document.querySelector('.cmsg.file a'); return el && el.href.startsWith('blob:'); }, null, { timeout: 15000 });
  });

  /* ---------- ۱۰) پنل شبکه ---------- */
  await step('پینگ کانال داده اندازه‌گیری شد', async () => {
    await A.waitForTimeout(5000);
    await A.click('#btnSettings');
    await A.click('#btnNetStats');
    await A.waitForFunction(() => document.querySelector('#netPingV').textContent.includes('ms'), null, { timeout: 10000 });
    const t = await A.textContent('#netTierV');
    await A.click('#mNet .mClose');
    await A.click('#mSet .mClose');
    return 'کیفیت: ' + t.trim();
  });

  /* ---------- ۱۱) کنترل انحصاری ---------- */
  await step('قفل کنترل توسط میزبان → ناوبری مهمان رد می‌شود', async () => {
    await A.click('.sideTabs button[data-side=people]');
    await A.click('#peopleList .prow:has-text("کنترل محیط مشترک") button:has-text("قفل")');
    await B.fill('#covUrl', 'https://wikipedia.org');
    await B.click('#covGo');
    await B.waitForSelector('.toast:has-text("کنترل")', { timeout: 8000 });
    const src = await B.evaluate(() => document.querySelector('#covFrame').src);
    if (src.includes('wikipedia')) throw Error('ناوبری باید رد می‌شد');
  });
  await step('آزادسازی کنترل → ناوبری مهمان دوباره کار می‌کند', async () => {
    await A.click('#peopleList .prow:has-text("کنترل محیط مشترک") button:has-text("آزادسازی")');
    await B.waitForTimeout(800);
    await B.fill('#covUrl', 'https://wikipedia.org');
    await B.click('#covGo');
    await B.waitForFunction(() => document.querySelector('#covFrame').src.includes('wikipedia'), null, { timeout: 10000 });
  });

  /* ---------- ۱۲) اتصال مجدد و بازیابی وضعیت ---------- */
  await step('ریفرش مهمان → بازیابی تاریخچه چت', async () => {
    await B.goto(APP);
    await B.click('#btnJoin');
    await B.fill('#jnCode', CODE);
    await B.fill('#jnName', 'سارا');
    await B.click('#jnGo');
    await B.waitForFunction(() => document.querySelectorAll('#presenceStack .pava').length === 2, null, { timeout: 15000 });
    await B.waitForSelector('.cmsg:has-text("سلام از علی")', { timeout: 10000 });
  });

  /* ---------- ۱۳) کیک توسط میزبان ---------- */
  await step('حذف مهمان توسط میزبان → خروج به لندینگ', async () => {
    await A.click('.sideTabs button[data-side=people]');
    await A.click('#peopleList .prow:has-text("سارا") .pact button');
    await A.click('#cfYes');
    await B.waitForFunction(() => document.querySelector('#landing') && !document.querySelector('#landing').classList.contains('hide'), null, { timeout: 10000 });
    await A.waitForFunction(() => document.querySelectorAll('#presenceStack .pava').length === 1, null, { timeout: 8000 });
  });

  /* ---------- ۱۴) حالت دستی (سیگنالینگ کپی/پیست) ---------- */
  const ctxC = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  const ctxD = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  const C = await ctxC.newPage(), D = await ctxD.newPage();
  await step('حالت دستی: اتصال میزبان↔مهمان با کپی/پیست', async () => {
    await C.goto(APP);
    await C.click('#btnCreate');
    await C.fill('#crName', 'میزبان‌دستی');
    await C.click('#crMode button[data-v=manual]');
    await C.click('#crGo');
    for (let i = 0; i < 15; i++) {
      await C.waitForTimeout(2000);
      const v = await C.evaluate(() => ({ len: document.querySelector('#mnOut').value.length, st: document.querySelector('#mnStatus').textContent.slice(0, 50) }));
      if (v.len > 300) { console.log(`   [mn] offer آماده شد در ~${(i + 1) * 2}s`); break; }
      if (i === 14) throw Error('offer ساخته نشد: ' + JSON.stringify(v));
    }
    const offer = await C.inputValue('#mnOut');
    await D.goto(APP);
    await D.click('#btnJoin');
    await D.fill('#jnCode', 'ZZZZZ');
    await D.fill('#jnName', 'مهمان‌دستی');
    await D.click('#jnMode button[data-v=manual]');
    await D.click('#jnGo');
    await D.fill('#mnIn', offer);
    await D.click('#mnApply');
    for (let i = 0; i < 15; i++) {
      await D.waitForTimeout(2000);
      const v = await D.evaluate(() => ({ len: document.querySelector('#mnOut').value.length, st: document.querySelector('#mnStatus').textContent.slice(0, 50) }));
      if (v.len > 300) { console.log(`   [mn] answer آماده شد در ~${(i + 1) * 2}s`); break; }
      if (i === 14) throw Error('answer ساخته نشد: ' + JSON.stringify(v));
    }
    const answer = await D.inputValue('#mnOut');
    await C.fill('#mnIn', answer);
    await C.click('#mnApply');
    for (let i = 0; i < 22; i++) {
      await C.waitForTimeout(2000);
      const ok = await C.evaluate(() => document.querySelector('#mnStatus').textContent.includes('✓'));
      if (ok) break;
      if (i === 21) {
        const st = await Promise.all([C, D].map((pg) => pg.evaluate(() => document.querySelector('#mnStatus').textContent.slice(0, 60))));
        throw Error('وضعیت اتصال: ' + JSON.stringify(st));
      }
    }
    await D.waitForFunction(() => document.querySelector('#mnStatus').textContent.includes('✓'), null, { timeout: 45000 });
  });
  await step('حالت دستی: چت واقعی بین دو طرف', async () => {
    await C.fill('#chatInput', 'پیام دستی');
    await C.click('#chatSend');
    await D.waitForSelector('.cmsg:has-text("پیام دستی")', { timeout: 8000 });
  });

  /* ---------- اسکرین‌شات‌ها برای بازبینی بصری ---------- */
  await A.click('#stageTabs button[data-tab=coview]');
  await A.waitForTimeout(600);
  await A.screenshot({ path: SHOTS + '/desktop-coview.png' });
  await A.click('#stageTabs button[data-tab=game]');
  await A.waitForTimeout(400);
  await A.screenshot({ path: SHOTS + '/desktop-game.png' });
  const ctxM = await browser.newContext({ viewport: { width: 390, height: 780 }, permissions: ['camera', 'microphone'] });
  const M = await ctxM.newPage();
  await M.goto(APP);
  await M.screenshot({ path: SHOTS + '/mobile-landing.png' });
  await M.click('#btnCreate');
  await M.fill('#crName', 'موبایل');
  await M.click('#crGo');
  await M.waitForSelector('#room.open', { timeout: 10000 });
  await M.waitForTimeout(800);
  await M.screenshot({ path: SHOTS + '/mobile-room.png' });

  await browser.close();

  /* ---------- گزارش ---------- */
  const fails = results.filter((r) => r.status === 'FAIL');
  console.log('\n══════════════ خلاصه ══════════════');
  console.log(`PASS: ${results.filter((r) => r.status === 'PASS').length} | WARN: ${results.filter((r) => r.status === 'WARN').length} | FAIL: ${fails.length}`);
  if (pageErrors.length) console.log('⚠ خطاهای صفحه:\n' + pageErrors.slice(0, 6).join('\n'));
  else console.log('بدون خطای جاوااسکریپت در صفحه‌ها ✓');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('CRASH:', e); process.exit(2); });
