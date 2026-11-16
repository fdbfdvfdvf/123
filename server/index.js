/* ورودی سرویس — Express + Socket.IO + REST + UI استاتیک */
const http = require('http');
const express = require('express');
const path = require('path');
const compression = require('compression');
const { Server } = require('socket.io');
const makeStore = require('./store');
const { install } = require('./gateway');
const buildRouter = require('./rooms');

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
// HTML بدون کش (استقرارهای جدید فوری می‌رسند)؛ etag برای اعتبارسنجی
app.use(express.static(path.join(__dirname, '..', 'web'), {
  index: 'index.html', maxAge: 0, etag: true, lastModified: true,
  setHeaders: (res, filePath) => { if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); },
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
