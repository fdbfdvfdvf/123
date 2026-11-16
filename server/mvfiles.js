/* مدیریت فایل‌های فیلم اشتراکی روی دیسک — آپلود chunked با توکن + سرو با پشتیبانی Range
   هر اتاق یک پوشه؛ فقط یک فیلم فعال در هر لحظه؛ فایل‌های نیمه‌کارهٔ قدیمی در استارت پاک می‌شوند. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(process.env.DATA_DIR || '.', 'mv');
const MAX_FILE = 2 * 1024 * 1024 * 1024;   // سقف ۲ گیگابایت
const CHUNK = 8 * 1024 * 1024;             // هر chunk ۸ مگابایت

fs.mkdirSync(ROOT, { recursive: true });

// توکن‌های آپلود فعال: token -> { room, exp, next, name }
const tokens = new Map();
setInterval(() => { const now = Date.now(); for (const [t, v] of tokens) if (v.exp < now) tokens.delete(t); }, 60000).unref?.();

// پاک‌سازی فایل‌های نیمه‌کارهٔ قدیمی‌تر از ۲۴ ساعت در راه‌اندازی
try {
  for (const dir of fs.readdirSync(ROOT)) {
    const d = path.join(ROOT, dir);
    if (!fs.statSync(d).isDirectory()) continue;
    for (const f of fs.readdirSync(d)) {
      const fp = path.join(d, f);
      try { if (f.endsWith('.part') && Date.now() - fs.statSync(fp).mtime > 864e5) fs.unlinkSync(fp); } catch {}
    }
  }
} catch {}

const safeName = (n) => (typeof n === 'string' &&
  /^[\w.\-() \u0600-\u06FF]{1,100}$/.test(n) &&
  /\.(mp4|webm|mkv|mov|m4v|avi|ogv)$/i.test(n) ? n : null);

const roomDir = (code) => path.join(ROOT, String(code).replace(/[^A-Z0-9]/gi, ''));

function issueToken(code) {
  const t = crypto.randomBytes(16).toString('hex');
  tokens.set(t, { room: String(code).toUpperCase(), exp: Date.now() + 2 * 3600e3, next: 0 });
  return t;
}

function checkToken(t, code) {
  const v = tokens.get(String(t || ''));
  return v && v.room === String(code).toUpperCase() && v.exp > Date.now() ? v : null;
}

// چسباندن chunkها به‌ترتیب؛ با آخرین chunk فایل نهایی می‌شود و توکن تمام می‌شود
function appendChunk(token, name, idx, buf, last) {
  const v = tokens.get(String(token || ''));
  if (!v || buf.length > CHUNK || idx !== v.next) return false;
  v.next = idx + 1;
  const dir = roomDir(v.room);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, name + '.part'), buf);
  if (last) {
    fs.renameSync(path.join(dir, name + '.part'), path.join(dir, name));
    tokens.delete(token);
  }
  return true;
}

// حذف کل پوشهٔ فیلم‌های اتاق (پایان پخش)
function cleanupRoom(code) { try { fs.rmSync(roomDir(code), { recursive: true, force: true }); } catch {} }

// حذف فیلم‌های قبلی اتاق هنگام گذاشتن فیلم جدید (به‌جز فایل فعلی)
function cleanupOthers(code, keepName) {
  const dir = roomDir(code);
  try {
    for (const f of fs.readdirSync(dir)) {
      if (f === keepName || f.endsWith('.part')) continue;
      try { fs.unlinkSync(path.join(dir, f)); } catch {}
    }
  } catch {}
}

module.exports = { ROOT, issueToken, checkToken, appendChunk, cleanupRoom, cleanupOthers, safeName, MAX_FILE, CHUNK };
