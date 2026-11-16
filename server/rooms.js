/* REST — سلامت سرویس، ساخت اتاق با رمز اختیاری، اطلاعات اتاق */
const express = require('express');
const { sha256, safeStr, randCode } = require('./guard');
const crypto = require('crypto');

module.exports = function buildRouter(store, gatewayState) {
  const r = express.Router();
  r.use(express.json({ limit: '64kb' }));

  r.get('/health', (_req, res) => {
    res.json({ ok: true, ts: Date.now(), storage: process.env.DATABASE_URL ? 'postgres' : 'file', rooms: gatewayState ? gatewayState.rooms.size : 0 });
  });

  r.post('/rooms', async (req, res) => {
    try {
      const name = safeStr(req.body?.name, 80).trim();
      const pass = safeStr(req.body?.pass, 64);
      if (!name) return res.status(400).json({ ok: false, err: 'نام اتاق لازم است' });
      let code = randCode(5);
      for (let i = 0; i < 6; i++) {
        if (!(await store.getRoom(code))) break;
        code = randCode(5);
      }
      const id = crypto.randomUUID();
      await store.createRoom({ id, code, passHash: pass ? sha256(pass) : null });
      res.json({ ok: true, code });
    } catch (e) { console.warn('create room', e.message); res.status(500).json({ ok: false, err: 'خطای سرور' }); }
  });

  r.get('/rooms/:code', async (req, res) => {
    try {
      const row = await store.getRoom(safeStr(req.params.code, 8).toUpperCase());
      if (!row) return res.status(404).json({ ok: false, err: 'اتاق پیدا نشد' });
      const live = gatewayState?.rooms.get(row.code);
      res.json({ ok: true, code: row.code, hasPass: !!row.pass_hash, online: live ? live.members.size : 0 });
    } catch (e) { res.status(500).json({ ok: false, err: 'خطای سرور' }); }
  });

  return r;
};
