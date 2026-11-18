/* ورودی سرویس — Express + Socket.IO + REST + UI استاتیک */
const http = require('http');
const express = require('express');
const path = require('path');
const compression = require('compression');
const { Server } = require('socket.io');
const makeStore = require('./store');
const { install } = require('./gateway');
const buildRouter = require('./rooms');
const { Limits } = require('./limits');
const mvf = require('./mvfiles');

const PORT = Number(process.env.PORT || 3121);
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
// فشرده‌سازی gzip/brotli برای HTML/JSON/API — حجم UI از ~۵۸KB به ~۱۵KB
app.use(compression({ threshold: 512, level: 6 }));
app.use((_req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });

const store = makeStore();
const stateHolder = { rooms: new Map() };
app.use('/api', buildRouter(store, stateHolder));

/* ═══ فیلم مشترک — توکن، آپلود chunked و سرو فایل با Range ═══ */
const mvLimits = new Limits();
app.get('/api/mv/token', async (req, res) => {
  const code = String(req.query.room || '').toUpperCase();
  if (!/^[A-Z0-9]{4,10}$/.test(code)) return res.status(400).json({ ok: false, err: 'badroom' });
  if (!mvLimits.check(`mvtok:${req.ip}`, 10, 60000)) return res.status(429).json({ ok: false, err: 'rate' });
  try { if (!(await store.getRoom(code))) return res.status(404).json({ ok: false, err: 'noroom' }); }
  catch { return res.status(500).json({ ok: false, err: 'server' }); }
  res.json({ ok: true, token: mvf.issueToken(code) });
});
app.post('/api/mv/upload', express.raw({ limit: mvf.CHUNK + 64 * 1024, type: () => true }), (req, res) => {
  const code = String(req.query.room || '').toUpperCase();
  const name = mvf.safeName(String(req.query.name || ''));
  const v = mvf.checkToken(req.query.token, code);
  if (!v || !name) return res.status(403).json({ ok: false, err: 'badtoken' });
  const idx = Number(req.query.i);
  const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!buf.length) return res.status(400).json({ ok: false, err: 'empty' });
  if (!mvf.appendChunk(req.query.token, name, idx, buf, req.query.last === '1')) return res.status(409).json({ ok: false, err: 'badchunk' });
  res.json({ ok: true, idx });
});
// پخش فیلم: sendFile روی کتابخانهٔ send سوار است و Range/206 را کامل پشتیبانی می‌کند (سیک آنی برای همه)
app.get('/mvfiles/:room/:file', (req, res) => {
  const room = String(req.params.room).replace(/[^A-Z0-9]/gi, '');
  const file = mvf.safeName(String(req.params.file));
  if (!file) return res.status(400).end();
  res.sendFile(path.join(mvf.ROOT, room, file), { acceptRanges: true, dotfiles: 'deny' }, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

// HTML بدون کش (استقرارهای جدید فوری می‌رسند)؛ etag برای اعتبارسنجی
app.use(express.static(path.join(__dirname, '..', 'web'), {
  index: 'index.html', maxAge: 0, etag: true, lastModified: true,
  setHeaders: (res, filePath) => { if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store'); },
}));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, '..', 'web', 'index.html')));

const server = http.createServer(app);
// perMessageDeflate برای پیام‌های بزرگ state؛ پینگ بلندتر برای شبکه‌های موبایل/NAT
const io = new Server(server, {
  cors: { origin: false },
  maxHttpBufferSize: 1e6,
  pingInterval: 20000,
  pingTimeout: 40000,
  perMessageDeflate: { threshold: 1024, zlibDeflateOptions: { level: 4 } },
});

(async () => {
  await store.init();
  const gw = install(io, store);
  stateHolder.rooms = gw.rooms;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Together platform listening on 0.0.0.0:${PORT} — storage: ${process.env.DATABASE_URL ? 'postgres' : 'file'}`);
  });

  // خاموشی نرم — k8s/railway rolling update بدون قطع اتاق‌های فعال
  let closing = false;
  const shutdown = (sig) => {
    if (closing) return;
    closing = true;
    console.log(`${sig} — graceful shutdown…`);
    const done = () => { console.log('bye'); process.exit(0); };
    io.close(() => {});
    server.close(done);
    store.close?.().catch(() => {});
    setTimeout(done, 8000).unref?.();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
})().catch((e) => { console.error('startup failed:', e); process.exit(1); });
