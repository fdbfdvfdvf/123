/* گارد و ابزارهای اعتبارسنجی — سرور هرگز URLهای دلخواه را fetch نمی‌کند؛
   این گاردها ورودی‌های کلاینت را قبل از ذخیره/پخش پاک‌سازی می‌کنند. */
const crypto = require('crypto');

function isValidUrl(u) {
  try {
    const x = new URL(String(u));
    return x.protocol === 'http:' || x.protocol === 'https:';
  } catch { return false; }
}

function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

function safeStr(s, max = 200) { return String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max); }

function randCode(n = 5) {
  const A = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const b = crypto.randomBytes(n);
  let c = '';
  for (let i = 0; i < n; i++) c += A[b[i] % A.length];
  return c;
}

function clamp(n, a, z) { n = Number(n) || 0; return Math.min(z, Math.max(a, n)); }

module.exports = { isValidUrl, sha256, safeStr, randCode, clamp };
