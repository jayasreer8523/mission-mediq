'use strict';
/* Mission MedIQ route scene: an original three-lane, behind-the-runner endless-runner view.
   The courier runs down a rail-yard corridor toward each checkpoint arch and stops there.
   No steering: lane weaving, coins and obstacles are cosmetic and never depend on answers.
   Honors prefers-reduced-motion (static frames, instant moves). */
class Scene {
  constructor(canvas) {
    this.c = canvas; this.x = canvas.getContext('2d'); this.W = 960; this.H = 540; canvas.width = this.W; canvas.height = this.H;
    this.HY = 190; this.K = 520; this.LW = 210; this.GAP = 1400; this.STOP = 300;
    this.pos = 0; this.target = 0; this.speed = 0; this.maxSpeed = 15; this.boostT = 0; this.parts = []; this.t = 0;
    this.finalMode = false; this.open = new Set(); this.gateTotal = 10; this.banner = ''; this.bannerT = 0; this.arrived = true; this.onArrive = null;
    this.lane = 0; this.laneX = 0; this.hopT = 0; this.phase = 0.9; this._pl = [0, 0]; this.coins = 0; this.lastCoinSeg = -1; this.cruise = false; this.weaveT = 0;
    this.stopAt(0, true);
    this._loop = this._loop.bind(this); this.running = false; this.last = performance.now();
    this.start();
  }
  gatePos(k) { return (k + 1) * this.GAP; }
  stopAt(k, instant) { this.target = this.gatePos(k) - this.STOP; this.arrived = false; if (instant || RM) { this.pos = this.target; this.arrived = true; this.speed = 0; this.lane = 0; this.laneX = 0; this.draw(); } }
  runTo(k) { this.target = k >= this.gateTotal ? this.gatePos(this.gateTotal - 1) + this.GAP * 0.9 : this.gatePos(k) - this.STOP; this.arrived = false; if (RM) { this.pos = this.target; this.arrived = true; this.draw(); if (this.onArrive) this.onArrive(); } }
  openGate(k) { this.open.add(k); this.burst(this.gatePos(k), 34, ['#ffd23f', '#ffffff', '#2ec4f1', '#ff4fa0']); if (RM) this.draw(); }
  boost(ms = 1400) { this.boostT = ms; }
  hop() { if (!RM) this.hopT = 28; }
  showBanner(t, ms = 1800) { this.banner = t; this.bannerT = ms; if (RM) { this.draw(); setTimeout(() => { this.banner = ''; this.draw(); }, ms); } }
  burst(wz, n, cols) { if (RM) return; const d = Math.max(0, wz - this.pos), p = this.K / (this.K + d), y = this.HY + (this.H - this.HY) * p - 120 * p;
    for (let i = 0; i < n; i++) this.parts.push({ x: this.W / 2 + (Math.random() - .5) * 200, y, vx: (Math.random() - .5) * 11, vy: -Math.random() * 8 - 2, life: 45 + Math.random() * 35, c: cols[i % cols.length], s: 4 + Math.random() * 5 }); }
  start() { if (!this.running && !RM) { this.running = true; this.last = performance.now(); requestAnimationFrame(this._loop); } }
  stop() { this.running = false; }
  _loop(now) {
    if (!this.running) return; const dt = Math.min(50, now - this.last) / 16.7; this.last = now; this.t += dt;
    if (this.cruise) { this.speed += (9 - this.speed) * 0.05 * dt; this.pos += this.speed * dt; }
    else {
      const dist = this.target - this.pos;
      if (dist > 0.5) {
        const want = Math.min(this.maxSpeed * (this.boostT > 0 ? 1.6 : 1), Math.max(2, dist * 0.05));
        this.speed += (want - this.speed) * 0.08 * dt; this.pos += Math.min(dist, this.speed * dt);
      } else { this.speed *= 0.8; if (!this.arrived) { this.arrived = true; this.pos = this.target; if (this.onArrive) this.onArrive(); } }
    }
    if (this.speed > 1) this.phase += (0.07 + this.speed * 0.014) * dt;
    // cosmetic lane weaving while running; returns to centre when stopped
    const moving = this.speed > 3;
    if (moving) { this.weaveT -= dt; if (this.weaveT <= 0) { this.weaveT = 45 + Math.random() * 40; const bl = this._blockedLanes(); const free = [-1, 0, 1].filter(l => !bl.includes(l)); this.lane = free[Math.floor(Math.random() * free.length)]; } } else this.lane = 0;
    this.laneX += (this.lane - this.laneX) * 0.14 * dt;
    if (this.hopT > 0) this.hopT -= dt; if (this.boostT > 0) this.boostT -= dt * 16.7; if (this.bannerT > 0) this.bannerT -= dt * 16.7;
    this.parts.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.4 * dt; p.life -= dt; }); this.parts = this.parts.filter(p => p.life > 0);
    this.draw(); requestAnimationFrame(this._loop);
  }
  /* depth d (world units ahead of camera) -> perspective scale */
  _p(d) { return this.K / (this.K + Math.max(-this.K * 0.9, d)); }
  _y(p) { return this.HY + (this.H - this.HY) * p; }
  _hash(i) { let x = (i * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; }
  draw() {
    const g = this.x, W = this.W, H = this.H, HY = this.HY, CX = W / 2, fm = this.finalMode, LW = this.LW, pos = this.pos;
    const P = (d) => this._p(d), Y = (p) => this._y(p), X = (xl, p) => CX + xl * LW * p;
    // sky
    const sky = g.createLinearGradient(0, 0, 0, HY + 20);
    if (fm) { sky.addColorStop(0, '#1d0b3f'); sky.addColorStop(.6, '#7a1fa2'); sky.addColorStop(1, '#ff5d8f'); } else { sky.addColorStop(0, '#2a8cff'); sky.addColorStop(.7, '#8fd3ff'); sky.addColorStop(1, '#ffe6b3'); }
    g.fillStyle = sky; g.fillRect(0, 0, W, HY + 20);
    // sun / moon and clouds
    g.fillStyle = fm ? '#ffe4f1' : '#fff3b0'; g.beginPath(); g.arc(CX + 230, HY - 70, fm ? 34 : 46, 0, 7); g.fill();
    g.fillStyle = fm ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.85)';
    for (let i = 0; i < 4; i++) { const cx = ((i * 290 - pos * 0.05) % (W + 200) + W + 200) % (W + 200) - 100, cy = 40 + (i % 2) * 38; g.beginPath(); g.ellipse(cx, cy, 70, 20, 0, 0, 7); g.ellipse(cx + 40, cy - 8, 40, 18, 0, 0, 7); g.fill(); }
    // distant skyline
    const sk = fm ? ['#3b1466', '#4c1b7e'] : ['#6aa6d8', '#86bde6'];
    for (let L = 0; L < 2; L++) { g.fillStyle = sk[L]; for (let i = 0; i < 18; i++) { const bx = i * 62 - L * 30 - ((pos * (0.02 + L * 0.02)) % 62), bh = 28 + this._hash(i + L * 40) * (50 + L * 20); g.fillRect(bx, HY - bh + L * 6, 54, bh + 4); } }
    // ground base
    g.fillStyle = fm ? '#2a1450' : '#5b4a6e'; g.fillRect(0, HY, W, H - HY);
    // side walls with painted panels, both sides
    for (const side of [-1, 1]) {
      const wallX = side * 2.0;
      for (let k = 14; k >= 0; k--) {
        const segLen = 140, base = Math.floor(pos / segLen) * segLen, d0 = base + k * segLen - pos, d1 = d0 + segLen; if (d1 < -this.K * 0.5) continue;
        const p0 = P(d0), p1 = P(d1), i = Math.floor(pos / segLen) + k, h = this._hash(i * 3 + (side > 0 ? 1 : 0)); const hh = 330;
        const xa = X(wallX, p0), xb = X(wallX, p1), ya = Y(p0), yb = Y(p1);
        const cols = fm ? ['#5b1f8f', '#7a2aa8', '#3d1a70', '#a03a9c'] : ['#ff9f5a', '#ffd23f', '#5ad1c4', '#f06fa8', '#8a7bd8', '#6ec0ff'];
        g.fillStyle = cols[Math.floor(h * cols.length)]; g.beginPath(); g.moveTo(xa, ya); g.lineTo(xb, yb); g.lineTo(xb, yb - hh * p1); g.lineTo(xa, ya - hh * p0); g.closePath(); g.fill();
        g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.moveTo(xa, ya - hh * p0 * 0.62); g.lineTo(xb, yb - hh * p1 * 0.62); g.lineTo(xb, yb - hh * p1 * 0.5); g.lineTo(xa, ya - hh * p0 * 0.5); g.closePath(); g.fill();
        if (h > 0.45) { g.fillStyle = 'rgba(255,255,255,.55)'; const mx = (xa + xb) / 2, my = (ya + yb) / 2 - hh * (p0 + p1) / 2 * 0.3; g.beginPath(); g.ellipse(mx, my, Math.abs(xb - xa) * 0.28, 16 * (p0 + p1) * 0.5, 0, 0, 7); g.fill(); }
      }
    }
    // track bed: three lanes
    const nearY = Y(P(-this.K * 0.5)), yh = HY;
    for (let L = -1; L <= 1; L++) {
      const xl = L - 0.5, xr = L + 0.5, p0 = P(-this.K * 0.5), p1 = P(8000);
      g.fillStyle = L === 0 ? (fm ? '#3a1d68' : '#7d6a92') : (fm ? '#331860' : '#74628a');
      g.beginPath(); g.moveTo(X(xl, p0), nearY); g.lineTo(X(xr, p0), nearY); g.lineTo(X(xr, p1), Y(p1)); g.lineTo(X(xl, p1), Y(p1)); g.closePath(); g.fill();
      g.strokeStyle = fm ? '#ff8fc4' : '#e8e1f2'; g.lineWidth = 3; g.globalAlpha = .55;
      for (const off of [-0.28, 0.28]) { g.beginPath(); g.moveTo(X(L + off, p0), nearY); g.lineTo(X(L + off, p1), Y(p1)); g.stroke(); }
      g.globalAlpha = 1;
    }
    // sleepers
    const SP = 70, sOff = pos % SP; g.fillStyle = fm ? '#1a0d36' : '#3e3050';
    for (let k = 0; k < 40; k++) { const d = k * SP - sOff, p = P(d), y = Y(p), th = Math.max(1.5, 14 * p); g.fillRect(X(-1.5, p), y - th, 3 * LW * p, th * 0.7); }
    // lane edge lines
    g.strokeStyle = fm ? '#ff5d8f' : '#ffd23f'; g.lineWidth = 4; for (const e of [-1.5, 1.5]) { g.beginPath(); g.moveTo(X(e, P(-this.K * 0.5)), nearY); g.lineTo(X(e, P(8000)), Y(P(8000))); g.stroke(); }
    // objects: obstacles and coins, far to near
    const SEG = 340, seg0 = Math.floor(pos / SEG);
    for (let k = 11; k >= 0; k--) {
      const i = seg0 + k, d = i * SEG - pos + 120; if (d < -80) continue; const h = this._hash(i + 11), lane = Math.floor(this._hash(i + 77) * 3) - 1, p = P(d), y = Y(p);
      if (this._nearGate(i * SEG + 120)) continue;
      if (h < 0.28) { // parked carriage block in a lane the runner never uses at that moment
        const w = 0.8 * LW * p, hgt = 150 * p, x = X(lane, p) - w / 2; g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x - 4, y - 4, w + 8, 8);
        g.fillStyle = ['#ff7a3d', '#2ec4f1', '#ff4fa0'][i % 3]; g.fillRect(x, y - hgt, w, hgt); g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(x + w * .1, y - hgt * .78, w * .8, hgt * .26); g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x, y - hgt * .18, w, hgt * .18);
      } else if (h < 0.5) { // low barrier
        const w = 0.78 * LW * p, hgt = 46 * p, x = X(lane, p) - w / 2; g.fillStyle = '#fff'; g.fillRect(x, y - hgt - 20 * p, w, hgt * .7); g.fillStyle = '#ff5d5d'; for (let s = 0; s < 5; s++) g.fillRect(x + s * w / 5, y - hgt - 20 * p, w / 10, hgt * .7); g.fillStyle = '#333'; g.fillRect(x + 4 * p, y - 20 * p, 6 * p, 20 * p); g.fillRect(x + w - 10 * p, y - 20 * p, 6 * p, 20 * p);
      } else if (h < 0.85) { // coin row (cosmetic)
        for (let c = 0; c < 5; c++) { const dc = d + c * 55, pc = P(dc); if (dc < -60) continue; const cx = X(lane, pc), cy = Y(pc) - 46 * pc - Math.abs(Math.sin(this.t * .1 + c)) * 6 * pc, r = 15 * pc;
          g.fillStyle = '#ffb000'; g.beginPath(); g.ellipse(cx, cy, r * Math.abs(Math.cos(this.t * .08 + c * .6)) + r * .25, r, 0, 0, 7); g.fill(); g.strokeStyle = '#fff3b0'; g.lineWidth = Math.max(1, 3 * pc); g.stroke(); }
        if (d < 40 && d > -40 && Math.abs(lane - this.laneX) < 0.6 && this.lastCoinSeg !== i && this.speed > 3) { this.lastCoinSeg = i; this.coins += 5; }
      }
    }
    // gates
    for (let k = 0; k < this.gateTotal; k++) {
      const d = this.gatePos(k) - pos; if (d > 3600 || d < -this.K * 0.85) continue;
      const p = P(d), y = Y(p), open = this.open.has(k), last = k === this.gateTotal - 1, w = 1.6 * LW * p, post = 22 * p, hgt = (last ? 360 : 300) * p;
      const col = open ? '#3ddc84' : (last ? '#ff4fa0' : '#ffd23f');
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(CX - w, y - 3, 2 * w, 6 * p + 2);
      if (!open) { const pat = g.createLinearGradient(0, y - hgt, 0, y); pat.addColorStop(0, 'rgba(255,255,255,.28)'); pat.addColorStop(1, 'rgba(255,210,63,.18)'); g.fillStyle = pat; g.fillRect(CX - w + post, y - hgt, 2 * w - 2 * post, hgt);
        g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = Math.max(1, 3 * p); for (let b = 1; b < 6; b++) { g.beginPath(); g.moveTo(CX - w + post, y - hgt * b / 6); g.lineTo(CX + w - post, y - hgt * b / 6); g.stroke(); } }
      g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 16 * p + 4; g.fillRect(CX - w, y - hgt, post, hgt); g.fillRect(CX + w - post, y - hgt, post, hgt); g.fillRect(CX - w, y - hgt - 34 * p, 2 * w, 38 * p); g.shadowBlur = 0;
      g.fillStyle = '#1b1147'; g.font = `900 ${Math.max(10, Math.round(30 * p))}px system-ui,sans-serif`; g.textAlign = 'center'; g.fillText(last ? 'FINAL CHECKPOINT' : 'CHECKPOINT ' + (k + 1), CX, y - hgt - 8 * p);
      g.textAlign = 'left';
    }
    // finish line
    const fd = this.gatePos(this.gateTotal - 1) + this.GAP * 0.95 - pos;
    if (this.gateTotal > 0 && fd > -this.K * 0.8 && fd < 3600) { const p = P(fd), y = Y(p), w = 1.5 * LW * p; for (let i = 0; i < 20; i++) { g.fillStyle = i % 2 ? '#fff' : '#111'; g.fillRect(CX - w + i * (2 * w / 20), y - 14 * p, 2 * w / 20, 14 * p); } g.fillStyle = '#fff'; g.font = `900 ${Math.max(10, Math.round(34 * p))}px system-ui`; g.textAlign = 'center'; g.fillText('FINISH', CX, y - 60 * p); g.textAlign = 'left'; }
    this._runner(g);
    // speed lines
    if (this.speed > 7 || this.boostT > 0) { g.strokeStyle = this.boostT > 0 ? 'rgba(255,210,63,.8)' : 'rgba(255,255,255,.35)'; g.lineWidth = 2; for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2 + this.t * 0.03, r0 = 280 + ((i * 53 + this.t * 14) % 220), r1 = r0 + 60 + this.speed * 3; g.beginPath(); g.moveTo(CX + Math.cos(a) * r0 * 1.3, HY + 120 + Math.sin(a) * r0 * .5); g.lineTo(CX + Math.cos(a) * r1 * 1.3, HY + 120 + Math.sin(a) * r1 * .5); g.stroke(); } }
    this.parts.forEach(p => { g.fillStyle = p.c; g.globalAlpha = Math.max(0, Math.min(1, p.life / 40)); g.fillRect(p.x, p.y, p.s, p.s); g.globalAlpha = 1; });
    if (fm) { g.fillStyle = 'rgba(255,255,255,.95)'; g.font = '900 15px system-ui'; g.fillText('FINAL CHECKPOINT AHEAD', 16, 28); }
    if (this.bannerT > 0 || (RM && this.banner)) { g.fillStyle = 'rgba(27,17,71,.78)'; g.fillRect(0, 120, W, 70); g.fillStyle = '#ffd23f'; g.font = '900 38px system-ui'; g.textAlign = 'center'; g.fillText(this.banner, CX, 168); g.textAlign = 'left'; }
  }
  /* lanes holding an obstacle in the next stretch, so the weaving runner never overlaps one */
  _blockedLanes() { const SEG = 340, s0 = Math.floor(this.pos / SEG), out = []; for (let k = 0; k < 4; k++) { const i = s0 + k, d = i * SEG - this.pos + 120; if (d < 0 || this._nearGate(i * SEG + 120)) continue; if (this._hash(i + 11) < 0.5) out.push(Math.floor(this._hash(i + 77) * 3) - 1); } return out; }
  _nearGate(z) { for (let k = 0; k < this.gateTotal; k++) { const gz = this.gatePos(k); if (z > gz - 520 && z < gz + 200) return true; } return false; }
  /* The runner, seen from behind: helmeted courier with a cross badge on the jacket. Original design.
     Run cycle: cadence follows speed; two-bone legs with knee bend and heel kick, arms pump opposite to the legs,
     torso twists and leans, body bobs on every foot strike, scarf flutters, dust puffs on foot plant. */
  _runner(g) {
    const p = this._p(60), s = p * 1.25, gy = this._y(p), cx = this.W / 2 + this.laneX * this.LW * p;
    const amp = Math.max(0, Math.min(1, (this.speed - 1) / 4)), ph = this.phase, boost = this.boostT > 0;
    const hopF = this.hopT > 0 ? Math.sin((1 - this.hopT / 28) * Math.PI) : 0, hop = hopF * 46;
    const by = gy - hop, breathe = (1 - amp) * Math.sin(this.t * 0.07) * 1.5 * s;
    const bob = amp * (Math.cos(2 * ph) + 1) / 2 * 9 * s + breathe, tiltLane = (this.lane - this.laneX) * 0.22;
    const pants = '#2b2a5e', jacket = boost ? '#ffb000' : '#14b8a6', jacketDark = boost ? '#d98f00' : '#0e8f83', skin = '#f0b48a';
    g.lineCap = 'round'; g.lineJoin = 'round';
    // shadow shrinks while airborne
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(cx, gy, 46 * s * (1 - hop / 170), 10 * s, 0, 0, 7); g.fill();
    if (boost) { g.fillStyle = 'rgba(255,210,63,.32)'; g.beginPath(); g.ellipse(cx, by - 100 * s, 95 * s, 135 * s, 0, 0, 7); g.fill(); }
    const hipY = by - 66 * s - bob, L = 35 * s;
    // ---- legs (drawn first, behind the torso) ----
    // Rear view: knees bend FORWARD (away from the viewer), so they never bow sideways. What the eye sees:
    // the thigh foreshortens, the trailing foot kicks up toward the viewer and shows its SOLE, and the leading foot
    // lands slightly higher and smaller (further away) showing the heel of the shoe.
    for (const side of [-1, 1]) {
      const phi = ph + (side < 0 ? 0 : Math.PI), swing = Math.sin(phi), kick = Math.max(0, swing) * amp, fwd = Math.max(0, -swing) * amp, lift2 = Math.max(kick, hopF * 0.85);
      const hx = cx + side * 13 * s, kx = hx + side * 2 * s, ky = hipY + L * (1 - 0.3 * lift2 - 0.06 * fwd);
      const ax = cx + side * (15 + 3 * Math.cos(phi) * amp) * s, ay = by - fwd * 9 * s - lift2 * 38 * s;   // ankle
      const near = 1 + 0.2 * lift2, far = 1 - 0.1 * fwd;                                                  // nearer = bigger, farther = smaller
      g.strokeStyle = pants; g.lineWidth = 18 * s * far; g.beginPath(); g.moveTo(hx, hipY); g.lineTo(kx, ky); g.stroke();
      g.lineWidth = 15 * s * near * far; g.beginPath(); g.moveTo(kx, ky); g.lineTo(ax, ay); g.stroke();
      g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(kx, ky, 8 * s, 6 * s, 0, 0, 7); g.fill();    // soft shading where the hidden knee sits
      if (lift2 > 0.22) {                                                                                   // sole of the kicked-up shoe
        const w = 16 * s * near, hh = (11 + 9 * lift2) * s;
        g.fillStyle = '#ff7a3d'; g.beginPath(); g.ellipse(ax, ay + 5 * s, w, hh, 0, 0, 7); g.fill();
        g.fillStyle = '#fff0dc'; g.beginPath(); g.ellipse(ax, ay + 5 * s, w * 0.78, hh * 0.8, 0, 0, 7); g.fill();
        g.strokeStyle = '#d9b99a'; g.lineWidth = Math.max(1, 1.6 * s); for (let t = -1; t <= 1; t++) { g.beginPath(); g.moveTo(ax - w * 0.6, ay + 5 * s + t * hh * 0.42); g.lineTo(ax + w * 0.6, ay + 5 * s + t * hh * 0.42); g.stroke(); }
        g.fillStyle = '#c9561f'; g.beginPath(); g.ellipse(ax, ay + 5 * s + hh * 0.62, w * 0.5, hh * 0.2, 0, 0, 7); g.fill();   // heel block
      } else {                                                                                              // back of the shoe on the ground
        g.fillStyle = '#ff7a3d'; g.beginPath(); g.ellipse(ax, ay + 3 * s, 15 * s * far, 9 * s * far, 0, 0, 7); g.fill();
        g.fillStyle = '#fff'; g.fillRect(ax - 5 * s * far, ay - 3 * s, 10 * s * far, 5 * s * far);
        g.fillStyle = '#b8461a'; g.fillRect(ax - 15 * s * far, ay + 7 * s * far, 30 * s * far, 3 * s * far);
      }
      const idx = side < 0 ? 0 : 1; if (this._pl[idx] > 0.12 && lift2 <= 0.12 && amp > 0.4 && !RM) for (let q = 0; q < 3; q++) this.parts.push({ x: ax + (Math.random() - .5) * 16 * s, y: gy - 2, vx: (Math.random() - .5) * 3, vy: -Math.random() * 2.2, life: 18 + Math.random() * 10, c: 'rgba(235,225,205,.85)', s: (3 + Math.random() * 3) * s });
      this._pl[idx] = lift2;
    }
    // ---- upper body: twist and lean around the hips ----
    g.save(); g.translate(cx, hipY - 4 * s); g.rotate(Math.sin(ph) * 0.07 * amp + tiltLane); g.translate(-cx, -(hipY - 4 * s));
    const ty = hipY - 74 * s;
    // scarf tails flutter behind the neck
    const fl = Math.sin(this.t * 0.45) * 6 * s * (0.4 + amp);
    g.strokeStyle = '#ff4fa0'; g.lineWidth = 9 * s; g.beginPath(); g.moveTo(cx + 6 * s, ty + 2 * s); g.quadraticCurveTo(cx + 22 * s + fl, ty + 6 * s, cx + 34 * s + fl * 1.6, ty - 6 * s * amp + 10 * s); g.stroke();
    g.lineWidth = 7 * s; g.beginPath(); g.moveTo(cx - 4 * s, ty + 4 * s); g.quadraticCurveTo(cx + 12 * s - fl, ty + 14 * s, cx + 20 * s - fl * 1.4, ty + 20 * s); g.stroke();
    // arms
    for (const side of [-1, 1]) {
      const phi = ph + (side < 0 ? Math.PI : 0), sw = Math.sin(phi) * amp;
      const sxp = cx + side * 31 * s, syp = ty + 16 * s, hxp = sxp + side * (13 + 6 * Math.cos(phi) * amp) * s, hyp = syp + 38 * s - sw * 26 * s - hopF * 30 * s;
      const exp = sxp + side * (22 + 4 * (1 - amp)) * s, eyp = (syp + hyp) / 2 + 10 * s;
      g.strokeStyle = jacket; g.lineWidth = 15 * s; g.beginPath(); g.moveTo(sxp, syp); g.lineTo(exp, eyp); g.stroke();
      g.lineWidth = 12 * s; g.beginPath(); g.moveTo(exp, eyp); g.lineTo(hxp, hyp); g.stroke();
      g.fillStyle = skin; g.beginPath(); g.arc(hxp, hyp, 7.5 * s, 0, 7); g.fill();
    }
    // jacket
    g.fillStyle = jacket; g.beginPath(); g.roundRect(cx - 32 * s, ty, 64 * s, 80 * s, 16 * s); g.fill();
    g.fillStyle = jacketDark; g.fillRect(cx - 3 * s, ty + 6 * s, 6 * s, 66 * s); g.fillRect(cx - 32 * s, ty + 62 * s, 64 * s, 8 * s);
    g.fillStyle = '#fff'; g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i - Math.PI / 2; g.lineTo(cx + Math.cos(a) * 17 * s, ty + 38 * s + Math.sin(a) * 17 * s); } g.closePath(); g.fill();
    g.fillStyle = '#ff4fa0'; g.fillRect(cx - 3.5 * s, ty + 29 * s, 7 * s, 18 * s); g.fillRect(cx - 9 * s, ty + 34.5 * s, 18 * s, 7 * s);
    // head with a small counter-bob and a head turn that follows the lane change
    const hb = -bob * 0.3 + Math.sin(ph) * 1.5 * s * amp;
    g.fillStyle = skin; g.fillRect(cx - 7 * s, ty - 4 * s, 14 * s, 8 * s);
    g.fillStyle = pants; g.beginPath(); g.arc(cx + (this.lane - this.laneX) * 6 * s, ty - 20 * s + hb, 31 * s, 0, 7); g.fill();
    g.fillStyle = '#ffd23f'; g.fillRect(cx - 31 * s, ty - 26 * s + hb, 62 * s, 9 * s); g.fillStyle = '#ff4fa0'; g.beginPath(); g.arc(cx, ty - 48 * s + hb, 7 * s, 0, 7); g.fill();
    g.restore();
    g.lineCap = 'butt'; g.lineJoin = 'miter';
  }
}
