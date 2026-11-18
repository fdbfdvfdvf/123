/* محدودکنندهٔ نرخ per-socket per-event — سطل بازشوندهٔ سبک در حافظه */
class Limits {
  constructor() { this.map = new Map(); this.sweepTimer = setInterval(() => this.sweep(), 120000); this.sweepTimer.unref?.(); }
  check(key, rate, per) {
    const now = Date.now();
    let b = this.map.get(key);
    if (!b || now - b.t0 > per) { b = { t0: now, n: 0, bad: 0 }; this.map.set(key, b); }
    if (b.n >= rate) { b.bad++; return false; }
    b.n++;
    return true;
  }
  violations(key) { const b = this.map.get(key); return b ? b.bad : 0; }
  sweep() {
    const now = Date.now();
    for (const [k, b] of this.map) if (now - b.t0 > 180000) this.map.delete(k);
  }
}

module.exports = { Limits };
