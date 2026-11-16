/* لایهٔ ذخیره‌سازی: اگر DATABASE_URL (PostgreSQL) باشد → PgStore، وگرنه FileStore (JSON) برای محلی/تست.
   هر دو یک رابط یکسان دارند تا gateway از هرکدام بی‌خبر استفاده کند. */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DDL = `
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  pass_hash TEXT,
  created_at BIGINT NOT NULL,
  closed_at BIGINT
);
CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  room_id TEXT NOT NULL,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  ts BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_room ON messages (room_id, id);
CREATE TABLE IF NOT EXISTS strokes (
  id BIGSERIAL PRIMARY KEY,
  room_id TEXT NOT NULL,
  data TEXT NOT NULL,
  ts BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_strokes_room ON strokes (room_id, id);
CREATE TABLE IF NOT EXISTS room_state (
  room_id TEXT NOT NULL,
  k TEXT NOT NULL,
  v TEXT NOT NULL,
  PRIMARY KEY (room_id, k)
);
`;

class FileStore {
  constructor(dataDir) {
    this.file = path.join(dataDir || '.', 'together-data.json');
    this.d = { rooms: {}, messages: {}, strokes: {}, state: {} };
  }
  async init() {
    try { this.d = JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch { /* فایل تازه */ }
    this.d.rooms ||= {}; this.d.messages ||= {}; this.d.strokes ||= {}; this.d.state ||= {};
    for (const k of ['messages', 'strokes']) this.d[k] ||= {};
    this.d.state ||= {};
    setInterval(() => this._flush(), 2000).unref?.();
  }
  _flush() { try { fs.writeFileSync(this.file, JSON.stringify(this.d)); } catch (e) { console.warn('store flush', e.message); } }
  async createRoom({ id, code, passHash }) { this.d.rooms[id] = { id, code, passHash: passHash || null, created_at: Date.now(), closed_at: null }; this._flush(); }
  async getRoom(code) {
    const r = Object.values(this.d.rooms).find((x) => x.code === code && !x.closed_at) || null;
    return r ? { id: r.id, code: r.code, pass_hash: r.passHash, created_at: r.created_at, closed_at: r.closed_at } : null;
  }
  async closeRoom(id) { if (this.d.rooms[id]) { this.d.rooms[id].closed_at = Date.now(); this._flush(); } }
  async addMessage(roomId, m) { (this.d.messages[roomId] ||= []).push(m); if (this.d.messages[roomId].length > 2000) this.d.messages[roomId] = this.d.messages[roomId].slice(-1000); }
  async getMessages(roomId, limit = 100) { return (this.d.messages[roomId] || []).slice(-limit); }
  async addStroke(roomId, data) { (this.d.strokes[roomId] ||= []).push(data); if (this.d.strokes[roomId].length > 4000) this.d.strokes[roomId] = this.d.strokes[roomId].slice(-2500); }
  async getStrokes(roomId, limit = 400) { return (this.d.strokes[roomId] || []).slice(-limit); }
  async clearStrokes(roomId) { this.d.strokes[roomId] = []; }
  async removeStroke(roomId, data) { this.d.strokes[roomId] = (this.d.strokes[roomId] || []).filter((x) => x !== data); }
  async setState(roomId, k, v) { (this.d.state[roomId] ||= {})[k] = v; }
  async getState(roomId) { return { ...(this.d.state[roomId] || {}) }; }
  async close() { this._flush(); }
}

class PgStore {
  constructor(url) { this.pool = new Pool({ connectionString: url, max: 5 }); }
  async init() { await this.pool.query(DDL); }
  async createRoom({ id, code, passHash }) {
    await this.pool.query('INSERT INTO rooms (id, code, pass_hash, created_at) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING', [id, code, passHash || null, Date.now()]);
  }
  async getRoom(code) {
    const r = await this.pool.query('SELECT id, code, pass_hash FROM rooms WHERE code=$1 AND closed_at IS NULL ORDER BY created_at DESC LIMIT 1', [code]);
    return r.rows[0] || null;
  }
  async closeRoom(id) { await this.pool.query('UPDATE rooms SET closed_at=$2 WHERE id=$1', [id, Date.now()]); }
  async addMessage(roomId, m) {
    await this.pool.query('INSERT INTO messages (room_id, name, body, ts) VALUES ($1,$2,$3,$4)', [roomId, m.name, m.body, m.ts]);
  }
  async getMessages(roomId, limit = 100) {
    const r = await this.pool.query('SELECT name, body, ts FROM (SELECT * FROM messages WHERE room_id=$1 ORDER BY id DESC LIMIT $2) t ORDER BY id ASC', [roomId, limit]);
    return r.rows;
  }
  async addStroke(roomId, data) {
    await this.pool.query('INSERT INTO strokes (room_id, data, ts) VALUES ($1,$2,$3)', [roomId, data, Date.now()]);
  }
  async getStrokes(roomId, limit = 400) {
    const r = await this.pool.query('SELECT data FROM (SELECT * FROM strokes WHERE room_id=$1 ORDER BY id DESC LIMIT $2) t ORDER BY id ASC', [roomId, limit]);
    return r.rows.map((x) => x.data);
  }
  async clearStrokes(roomId) { await this.pool.query('DELETE FROM strokes WHERE room_id=$1', [roomId]); }
  async removeStroke(roomId, data) { await this.pool.query('DELETE FROM strokes WHERE room_id=$1 AND data=$2 LIMIT 1', [roomId, data]); }
  async setState(roomId, k, v) {
    await this.pool.query('INSERT INTO room_state (room_id, k, v) VALUES ($1,$2,$3) ON CONFLICT (room_id, k) DO UPDATE SET v=$3', [roomId, k, v]);
  }
  async getState(roomId) {
    const r = await this.pool.query('SELECT k, v FROM room_state WHERE room_id=$1', [roomId]);
    return Object.fromEntries(r.rows.map((x) => [x.k, x.v]));
  }
  async close() { try { await this.pool.end(); } catch {} }
}

module.exports = function makeStore() {
  if (process.env.DATABASE_URL) return new PgStore(process.env.DATABASE_URL);
  return new FileStore(process.env.DATA_DIR || '.');
};
module.exports.FileStore = FileStore;
module.exports.PgStore = PgStore;
