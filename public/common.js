'use strict';
/* shared helpers */
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
const $ = (s, r = document) => r.querySelector(s);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SESSION_NAMES = ['US healthcare landscape', 'Stakeholders and organizations', 'Insurance, patient costs and payment', 'Healthcare IT systems', 'Data lifecycle, PHI and HIPAA',
  'Interoperability: HL7 v2, CDA, FHIR', 'Terminology and code sets', 'Claims workflow and revenue cycle', 'Quality, value-based care and analytics', 'AI, responsible use and careers'];
const fmtTime = (ms) => { ms = Math.max(0, ms); const s = Math.ceil(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const fmtDur = (ms) => { const s = Math.round(ms / 1000); return Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 's'; };
async function api(path, opts = {}) {
  const r = await fetch(path, { method: opts.method || (opts.body ? 'POST' : 'GET'), credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: 'Bearer ' + opts.token } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let j = {}; try { j = await r.json(); } catch { /* ignore */ }
  if (!r.ok) { const e = new Error(j.error || 'Request failed (' + r.status + ')'); e.status = r.status; e.field = j.field; throw e; }
  return j;
}
/* Original "agent" badge: hex shield with a visor and a medical cross. Not derived from any existing character. */
function agentSVG(size = 34, color = '#27d7c4') {
  return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true"><polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="#0e1b36" stroke="${color}" stroke-width="2.5"/><rect x="9" y="14" width="22" height="9" rx="4.5" fill="${color}"/><rect x="17.5" y="26" width="5" height="9" rx="1" fill="#ffb340"/><rect x="15.5" y="28" width="9" height="5" rx="1" fill="#ffb340"/></svg>`;
}
/* optional sound: tiny WebAudio synth, off by default */
const Sound = {
  on: false, ctx: null,
  toggle() { this.on = !this.on; if (this.on && !this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); return this.on; },
  beep(f = 440, d = .1, type = 'sine', v = .06, t0 = 0) {
    if (!this.on || !this.ctx) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = f; g.gain.value = v; o.connect(g); g.connect(c.destination);
    const t = c.currentTime + t0; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d); o.start(t); o.stop(t + d);
  },
  pick() { this.beep(520, .06, 'triangle'); }, gate() { this.beep(330, .12, 'sawtooth', .04); this.beep(660, .2, 'sawtooth', .04, .1); },
  boost() { [523, 659, 784].forEach((f, i) => this.beep(f, .15, 'triangle', .06, i * .08)); }, final() { [392, 523, 659, 784, 1047].forEach((f, i) => this.beep(f, .25, 'triangle', .06, i * .12)); },
};
