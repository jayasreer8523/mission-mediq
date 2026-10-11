'use strict';
/* Mission MedIQ server: Node 22 + built-in SQLite (WAL). Answer keys and scoring never leave the server
   until an attempt is submitted/expired. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { buildWorkbook } = require('./lib/export');

const PORT = +process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'mediq.db');
const ATTEMPT_MS = (+process.env.ATTEMPT_MINUTES || 20) * 60000;
const GRACE_MS = 4000;               // network latency allowance for online final sync
const AMEND_WINDOW_MS = 6 * 3600e3;  // how long after expiry an offline-queued result may still arrive
const DEFAULT_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS || 'healthcatalyst.com').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
const PROD = process.env.NODE_ENV === 'production';
const PER_SESSION = 2, SESSIONS = 10, TOTAL = PER_SESSION * SESSIONS, POINTS = 100;

const BANK = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'questions.json'), 'utf8'));
const BANK_BY_ID = new Map(BANK.map(q => [q.id, q]));
if (BANK.length !== 60) throw new Error('Question bank must have 60 questions');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY, code TEXT UNIQUE, name TEXT, status TEXT, pass_pct INTEGER, domains TEXT, created_at INTEGER);
CREATE TABLE IF NOT EXISTS participants(id TEXT PRIMARY KEY, room_id TEXT, email TEXT, full_name TEXT, display_name TEXT, token_hash TEXT, resume_hash TEXT, created_at INTEGER,
  UNIQUE(room_id,email));
CREATE UNIQUE INDEX IF NOT EXISTS ux_disp ON participants(room_id, lower(display_name));
CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY, participant_id TEXT, room_id TEXT, attempt_no INTEGER, status TEXT,
  started_at INTEGER, deadline INTEGER, finished_at INTEGER, questions TEXT, last_seen INTEGER, last_progress INTEGER,
  correct INTEGER, points INTEGER, recovered INTEGER DEFAULT 0, offline_expiry INTEGER DEFAULT 0, final_sync INTEGER DEFAULT 0, scored_at INTEGER,
  UNIQUE(participant_id, attempt_no));
CREATE TABLE IF NOT EXISTS answers(attempt_id TEXT, qid TEXT, choice INTEGER, seq INTEGER, elapsed_ms INTEGER, updated_at INTEGER, PRIMARY KEY(attempt_id,qid));
CREATE TABLE IF NOT EXISTS tokens(hash TEXT PRIMARY KEY, participant_id TEXT);
CREATE INDEX IF NOT EXISTS ix_att_room ON attempts(room_id);
`);
const q = (sql) => db.prepare(sql);
const now = () => Date.now();
const rid = (n = 12) => crypto.randomBytes(n).toString('base64url');
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function meta(k, gen) {
  const r = q('SELECT v FROM meta WHERE k=?').get(k);
  if (r) return r.v;
  const v = gen(); q('INSERT INTO meta VALUES(?,?)').run(k, v); return v;
}
const SECRET = process.env.SESSION_SECRET || meta('secret', () => crypto.randomBytes(32).toString('hex'));
const hmac = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');

/* ---------- trainer auth ---------- */
function verifyPassword(pw) {
  const h = process.env.TRAINER_PASSWORD_HASH;
  if (h) {
    const [alg, salt, hex] = h.split('$');
    if (alg !== 'scrypt') return false;
    const got = crypto.scryptSync(pw, salt, 32);
    const want = Buffer.from(hex, 'hex');
    return want.length === got.length && crypto.timingSafeEqual(got, want);
  }
  if (process.env.TRAINER_PASSWORD && !PROD) {
    const a = Buffer.from(sha(pw)), b = Buffer.from(sha(process.env.TRAINER_PASSWORD));
    return crypto.timingSafeEqual(a, b);
  }
  return false;
}
const loginFails = new Map();
function rateLimited(ip) {
  const r = loginFails.get(ip); if (!r) return false;
  if (now() - r.t > 15 * 60e3) { loginFails.delete(ip); return false; }
  return r.n >= 5;
}
function noteFail(ip) { const r = loginFails.get(ip); if (!r || now() - r.t > 15 * 60e3) loginFails.set(ip, { n: 1, t: now() }); else r.n++; }
function trainerCookie() {
  const exp = now() + 12 * 3600e3, body = `t.${exp}`;
  return `${body}.${hmac(body)}`;
}
function trainerOk(req) {
  const m = /(?:^|;\s*)mq_trainer=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return false;
  const [t, exp, sig] = m[1].split('.');
  if (t !== 't' || !sig || +exp < now()) return false;
  const want = hmac(`t.${exp}`);
  return sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}

/* ---------- helpers ---------- */
class HttpErr extends Error { constructor(code, msg, extra) { super(msg); this.code = code; this.extra = extra; } }
const bad = (m, extra) => new HttpErr(400, m, extra);
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function readBody(req) {
  return new Promise((res, rej) => {
    let n = 0; const ch = [];
    req.on('data', c => { n += c.length; if (n > 2e6) { rej(new HttpErr(413, 'Too large')); req.destroy(); } else ch.push(c); });
    req.on('end', () => { try { res(ch.length ? JSON.parse(Buffer.concat(ch).toString()) : {}); } catch { rej(bad('Invalid JSON')); } });
  });
}
function send(res, code, obj, headers = {}) {
  const b = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(b);
}
function parseDomains(s) { return String(s || '').toLowerCase().split(/[,\s;]+/).map(x => x.replace(/^@/, '')).filter(Boolean); }
const EMAIL_RE = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/;
const effDomains = (r) => { const d = parseDomains(r.domains); return d.length ? d : DEFAULT_DOMAINS; };  // never fall back to "any email"
function genCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c; do { c = Array.from({ length: 6 }, () => A[crypto.randomInt(A.length)]).join(''); } while (q('SELECT 1 FROM rooms WHERE code=?').get(c)); return c; }

/* ---------- attempt logic ---------- */
function makeQuestionSet() {
  const out = [];
  for (let s = 1; s <= SESSIONS; s++) {
    const pool = BANK.filter(b => b.session === s);
    shuffle(pool).slice(0, PER_SESSION).forEach(b => out.push({ id: b.id, order: shuffle([0, 1, 2, 3]) }));
  }
  return out;
}
function expireDue() {
  const due = q("SELECT id FROM attempts WHERE status='active' AND deadline < ?").all(now());
  for (const { id } of due) scoreAttempt(id, 'expired', null);
}
setInterval(() => { try { expireDue(); } catch (e) { console.error(e); } }, 3000).unref();

function scoreOf(att) {
  const qs = JSON.parse(att.questions);
  const ans = new Map(q('SELECT * FROM answers WHERE attempt_id=?').all(att.id).map(a => [a.qid, a]));
  let correct = 0; const detail = [];
  for (const { id, order } of qs) {
    const a = ans.get(id);
    const key = BANK_BY_ID.get(id);
    const shownCorrect = order.indexOf(key.correctIndex);
    const ok = a ? a.choice === shownCorrect : null;
    if (ok) correct++;
    detail.push({ id, order, choice: a ? a.choice : null, correctPos: shownCorrect, ok, elapsedMs: a ? a.elapsed_ms : null });
  }
  return { correct, detail };
}
function scoreAttempt(id, status, finishedAt, flags = {}) {
  const att = q('SELECT * FROM attempts WHERE id=?').get(id);
  const { correct } = scoreOf(att);
  const fin = finishedAt ?? Math.min(now(), att.deadline);
  q(`UPDATE attempts SET status=?, finished_at=?, correct=?, points=?, scored_at=?, recovered=MAX(recovered,?), offline_expiry=MAX(offline_expiry,?), final_sync=MAX(final_sync,?) WHERE id=?`)
    .run(status, fin, correct, correct * POINTS, now(), flags.recovered ? 1 : 0, flags.offline ? 1 : 0, flags.final ? 1 : 0, id);
}
function applyAnswers(att, list, offlineQueued) {
  const qs = JSON.parse(att.questions); const ids = new Set(qs.map(x => x.id));
  const limit = att.deadline - att.started_at;
  let accepted = 0, late = 0;
  const upsert = q(`INSERT INTO answers(attempt_id,qid,choice,seq,elapsed_ms,updated_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT(attempt_id,qid) DO UPDATE SET choice=excluded.choice, seq=excluded.seq, elapsed_ms=excluded.elapsed_ms, updated_at=excluded.updated_at WHERE excluded.seq > answers.seq`);
  for (const a of (Array.isArray(list) ? list : []).slice(0, 40)) {
    if (!a || !ids.has(a.qid) || !Number.isInteger(a.choice) || a.choice < 0 || a.choice > 3 || !Number.isFinite(a.seq)) continue;
    const el = Math.max(0, Math.min(+a.elapsedMs || 0, limit * 2));
    if (now() > att.deadline + GRACE_MS) {
      // after the deadline only answers given before it (client-reported) and queued offline are accepted
      if (!(offlineQueued && el <= limit + 1500)) { late++; continue; }
    }
    const r = upsert.run(att.id, a.qid, a.choice, Math.floor(a.seq), Math.floor(el), now());
    if (r.changes) accepted++;
  }
  const prog = q('SELECT COUNT(*) c FROM answers WHERE attempt_id=?').get(att.id).c;
  q('UPDATE attempts SET last_seen=?, last_progress=CASE WHEN ?>0 THEN ? ELSE last_progress END WHERE id=?').run(now(), accepted, now(), att.id);
  return { accepted, late, answered: prog };
}
function attemptView(att) {
  const qs = JSON.parse(att.questions);
  const ans = q('SELECT qid,choice,seq FROM answers WHERE attempt_id=?').all(att.id);
  return {
    id: att.id, attemptNo: att.attempt_no, status: att.status, startedAt: att.started_at, deadline: att.deadline, serverNow: now(),
    recoverySig: hmac(`rec.${att.id}.${att.participant_id}`),
    questions: qs.map(({ id, order }) => { const b = BANK_BY_ID.get(id); return { id, session: b.session, text: b.text, options: order.map(i => b.options[i]) }; }),
    answers: Object.fromEntries(ans.map(a => [a.qid, { choice: a.choice, seq: a.seq }])),
  };
}
function resultView(att) {
  const { correct, detail } = scoreOf(att);
  const qs = detail.map(d => {
    const b = BANK_BY_ID.get(d.id);
    return { id: d.id, session: b.session, objective: b.objective, text: b.text, options: d.order.map(i => b.options[i]), choice: d.choice, correctPos: d.correctPos, ok: d.ok, explanation: b.explanation, source: b.source };
  });
  const room = q('SELECT * FROM rooms WHERE id=?').get(att.room_id);
  const sessions = Array.from({ length: SESSIONS }, (_, i) => ({ session: i + 1, score: qs.filter(x => x.session === i + 1 && x.ok).length, of: PER_SESSION }));
  const pct = Math.round(correct / TOTAL * 1000) / 10;
  return {
    attemptId: att.id, attemptNo: att.attempt_no, status: att.status, correct, total: TOTAL, points: correct * POINTS, maxPoints: TOTAL * POINTS, pct,
    passPct: room.pass_pct, passed: pct >= room.pass_pct, outcome: pct >= room.pass_pct ? 'Mission complete' : 'Mission not yet complete',
    duration: att.finished_at - att.started_at, unanswered: qs.filter(x => x.choice === null).length, sessions, questions: qs,
    rank: firstAttemptRank(att),
    flags: { recovered: !!att.recovered, offlineExpiry: !!att.offline_expiry },
  };
}
function rankedFirstAttempts(roomId) {
  const rows = q(`SELECT a.*, p.display_name FROM attempts a JOIN participants p ON p.id=a.participant_id WHERE a.room_id=? AND a.attempt_no=1 AND a.status IN ('submitted','expired')`).all(roomId);
  rows.sort((x, y) => y.points - x.points || (x.finished_at - x.started_at) - (y.finished_at - y.started_at) || x.started_at - y.started_at);
  return rows;
}
function firstAttemptRank(att) {
  if (att.attempt_no !== 1 || !['submitted', 'expired'].includes(att.status)) return null;
  const i = rankedFirstAttempts(att.room_id).findIndex(r => r.id === att.id);
  return i < 0 ? null : i + 1;
}
function connStatus(a) {
  if (a.status !== 'active') return a.status;
  return now() - (a.last_seen || a.started_at) > 35000 ? 'reconnecting' : 'active';
}

/* ---------- participant routes ---------- */
function participantFrom(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) throw new HttpErr(401, 'Not signed in');
  const p = q('SELECT p.* FROM participants p JOIN tokens t ON t.participant_id=p.id WHERE t.hash=?').get(sha(m[1]));
  if (!p) throw new HttpErr(401, 'Session not recognised. Please rejoin with your resume code.');
  return p;
}
function meState(p) {
  expireDue();
  const room = q('SELECT * FROM rooms WHERE id=?').get(p.room_id);
  const atts = q('SELECT * FROM attempts WHERE participant_id=? ORDER BY attempt_no').all(p.id);
  const active = atts.find(a => a.status === 'active');
  const history = atts.filter(a => a.status !== 'active').map(a => ({ attemptId: a.id, attemptNo: a.attempt_no, status: a.status, points: a.points, correct: a.correct, pct: Math.round(a.correct / TOTAL * 1000) / 10, passed: a.correct / TOTAL * 100 >= room.pass_pct }));
  const last = atts[atts.length - 1];
  const canStart = room.status === 'open' && !active && (!last || (last.status !== 'active' && !history[history.length - 1].passed));
  return {
    serverNow: now(), participant: { id: p.id, displayName: p.display_name }, room: { code: room.code, name: room.name, status: room.status, passPct: room.pass_pct, minutes: ATTEMPT_MS / 60000 },
    attempt: active ? attemptView(active) : null, history, canStart, hasPassed: history.some(h => h.passed),
  };
}
const ipOf = (req) => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const joinHits = new Map();
function joinLimit(ip) { const t = now(); const a = (joinHits.get(ip) || []).filter(x => t - x < 60000); a.push(t); joinHits.set(ip, a); if (a.length > 40) throw new HttpErr(429, 'Too many requests. Please wait a minute.'); }

const routes = [];
const route = (method, re, fn, auth) => routes.push({ method, re, fn, auth });

route('GET', /^\/api\/config$/, () => ({ attemptMinutes: ATTEMPT_MS / 60000, questions: TOTAL, serverNow: now() }));
route('GET', /^\/api\/room\/([A-Za-z0-9]{4,10})$/, (req, b, m) => {
  const r = q('SELECT * FROM rooms WHERE code=?').get(m[1].toUpperCase());
  if (!r) throw new HttpErr(404, 'Room not found. Check the code.');
  return { name: r.name, status: r.status, domains: effDomains(r) };
});
route('POST', /^\/api\/join$/, (req, b) => {
  joinLimit(ipOf(req));
  const room = q('SELECT * FROM rooms WHERE code=?').get(String(b.code || '').toUpperCase());
  if (!room) throw new HttpErr(404, 'Room not found. Check the code.');
  const email = String(b.email || '').trim().toLowerCase(), full = String(b.fullName || '').trim().replace(/\s+/g, ' '), disp = String(b.displayName || '').trim().replace(/\s+/g, ' ');
  const em = EMAIL_RE.exec(email);
  if (!em) throw bad('Enter a valid email address.', { field: 'email' });
  const doms = effDomains(room);
  if (!doms.includes(em[1])) throw bad(`Use your Health Catalyst email (${doms.map(d => '@' + d).join(', ')}).`, { field: 'email' });
  if (full.length < 2 || full.length > 80) throw bad('Enter your full name.', { field: 'fullName' });
  if (disp.length < 2 || disp.length > 20 || /[<>]/.test(disp)) throw bad('Display name must be 2-20 characters, without < or >.', { field: 'displayName' });
  if (q('SELECT 1 FROM participants WHERE room_id=? AND email=?').get(room.id, email)) throw new HttpErr(409, 'This email has already joined. Use "Resume" with your resume code.', { field: 'email' });
  if (room.status === 'closed') throw new HttpErr(403, 'This room is closed to new players.');
  if (q('SELECT 1 FROM participants WHERE room_id=? AND lower(display_name)=lower(?)').get(room.id, disp)) throw new HttpErr(409, 'That display name is taken. Try another.', { field: 'displayName' });
  const id = rid(9), token = rid(24), resume = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[crypto.randomInt(32)]).join('');
  q('INSERT INTO participants VALUES(?,?,?,?,?,?,?,?)').run(id, room.id, email, full, disp, '', sha(resume), now());
  q('INSERT INTO tokens VALUES(?,?)').run(sha(token), id);
  return { token, resumeCode: resume, state: meState(q('SELECT * FROM participants WHERE id=?').get(id)) };
});
route('POST', /^\/api\/resume$/, (req, b) => {
  joinLimit(ipOf(req));
  const room = q('SELECT * FROM rooms WHERE code=?').get(String(b.code || '').toUpperCase());
  const p = room && q('SELECT * FROM participants WHERE room_id=? AND email=?').get(room.id, String(b.email || '').trim().toLowerCase());
  if (!p || p.resume_hash !== sha(String(b.resumeCode || '').trim().toUpperCase())) throw new HttpErr(403, 'Email or resume code not recognised. Ask your trainer to reset it.');
  const token = rid(24); q('INSERT INTO tokens VALUES(?,?)').run(sha(token), p.id);
  return { token, state: meState(p) };
});
route('GET', /^\/api\/me$/, (req) => meState(participantFrom(req)));
route('POST', /^\/api\/attempt\/start$/, (req) => {
  const p = participantFrom(req);
  const s = meState(p);
  if (s.attempt) return s;                       // one active attempt only: idempotent
  if (!s.canStart) throw new HttpErr(403, s.room.status !== 'open' ? 'The room is not open for new starts.' : s.hasPassed ? 'You have already completed the mission.' : 'You cannot start a new attempt right now.');
  const n = (q('SELECT MAX(attempt_no) m FROM attempts WHERE participant_id=?').get(p.id).m || 0) + 1;
  const t = now(); const id = rid(9);
  q('INSERT INTO attempts(id,participant_id,room_id,attempt_no,status,started_at,deadline,questions,last_seen,last_progress) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(id, p.id, p.room_id, n, 'active', t, t + ATTEMPT_MS, JSON.stringify(makeQuestionSet()), t, t);
  return meState(p);
});
route('POST', /^\/api\/attempt\/sync$/, (req, b) => {
  const p = participantFrom(req);
  expireDue();
  const att = q('SELECT * FROM attempts WHERE id=? AND participant_id=?').get(String(b.attemptId || ''), p.id);
  if (!att) throw new HttpErr(404, 'Attempt not found');
  if (att.final_sync) return { done: true, status: att.status, serverNow: now(), duplicate: true };
  const wasExpired = att.status === 'expired';
  if (wasExpired && now() > att.deadline + AMEND_WINDOW_MS) return { done: true, status: 'expired', serverNow: now() };
  const queued = !!b.queuedOffline;
  const r = applyAnswers(att, b.answers, queued);
  const fresh = q('SELECT * FROM attempts WHERE id=?').get(att.id);
  const offlineLate = (wasExpired || now() > att.deadline) && queued;
  if (b.final) {
    const el = Math.min(+b.finalElapsedMs || (now() - att.started_at), att.deadline - att.started_at);
    const fin = offlineLate ? att.started_at + Math.max(0, el) : Math.min(now(), att.deadline);
    scoreAttempt(att.id, b.auto ? 'expired' : 'submitted', fin, { offline: offlineLate, final: true });
    return { done: true, status: b.auto ? 'expired' : 'submitted', serverNow: now(), ...r };
  }
  if (fresh.status === 'expired' && offlineLate && r.accepted) scoreAttempt(att.id, 'expired', fresh.finished_at, { offline: true });
  return { done: fresh.status !== 'active', status: fresh.status, serverNow: now(), deadline: fresh.deadline, ...r };
});
route('GET', /^\/api\/attempt\/([A-Za-z0-9_-]+)\/result$/, (req, b, m) => {
  const p = participantFrom(req); expireDue();
  const att = q('SELECT * FROM attempts WHERE id=? AND participant_id=?').get(m[1], p.id);
  if (!att) throw new HttpErr(404, 'Attempt not found');
  if (att.status === 'active') throw new HttpErr(403, 'Results are available after you submit.');
  return resultView(att);
});

/* ---------- trainer routes ---------- */
route('POST', /^\/api\/trainer\/login$/, (req, b, m, res) => {
  const ip = ipOf(req);
  if (rateLimited(ip)) throw new HttpErr(429, 'Too many failed attempts. Try again in 15 minutes.');
  if (!verifyPassword(String(b.password || ''))) { noteFail(ip); throw new HttpErr(401, 'Incorrect password.'); }
  loginFails.delete(ip);
  const secure = PROD || /https/.test(req.headers['x-forwarded-proto'] || '') ? '; Secure' : '';
  return { ok: true, headers: { 'Set-Cookie': `mq_trainer=${trainerCookie()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure}` } };
});
route('POST', /^\/api\/trainer\/logout$/, () => ({ ok: true, headers: { 'Set-Cookie': 'mq_trainer=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' } }));
route('GET', /^\/api\/trainer\/me$/, () => ({ ok: true, defaultDomains: DEFAULT_DOMAINS }), 'trainer');
const roomView = (r) => ({ id: r.id, code: r.code, name: r.name, status: r.status, passPct: r.pass_pct, domains: parseDomains(r.domains), createdAt: r.created_at,
  participants: q('SELECT COUNT(*) c FROM participants WHERE room_id=?').get(r.id).c, active: q("SELECT COUNT(*) c FROM attempts WHERE room_id=? AND status='active'").get(r.id).c });
route('GET', /^\/api\/trainer\/rooms$/, () => (expireDue(), q('SELECT * FROM rooms ORDER BY created_at DESC').all().map(roomView)), 'trainer');
route('POST', /^\/api\/trainer\/rooms$/, (req, b) => {
  const name = String(b.name || '').trim().slice(0, 80); if (!name) throw bad('Room name required');
  const pass = b.passPct === undefined ? 70 : +b.passPct; if (!(pass >= 0 && pass <= 100)) throw bad('Pass mark must be 0-100');
  const doms = parseDomains(b.domains === undefined ? DEFAULT_DOMAINS.join(',') : b.domains);
  const id = rid(8), code = genCode();
  q('INSERT INTO rooms VALUES(?,?,?,?,?,?,?)').run(id, code, name, 'draft', Math.round(pass), doms.join(','), now());
  return roomView(q('SELECT * FROM rooms WHERE id=?').get(id));
}, 'trainer');
route('PATCH', /^\/api\/trainer\/rooms\/([\w-]+)$/, (req, b, m) => {
  const r = q('SELECT * FROM rooms WHERE id=?').get(m[1]); if (!r) throw new HttpErr(404, 'Room not found');
  if (b.status !== undefined) {
    if (!['draft', 'open', 'closed'].includes(b.status)) throw bad('Invalid status');
    if (b.status === 'draft' && r.status !== 'draft') throw bad('A room cannot go back to draft.');
    q('UPDATE rooms SET status=? WHERE id=?').run(b.status, r.id);
  }
  if (b.passPct !== undefined) {
    if (r.status !== 'draft') throw bad('The pass mark can only be changed before the room is opened.');
    const v = +b.passPct; if (!(v >= 0 && v <= 100)) throw bad('Pass mark must be 0-100');
    q('UPDATE rooms SET pass_pct=? WHERE id=?').run(Math.round(v), r.id);
  }
  if (b.domains !== undefined) q('UPDATE rooms SET domains=? WHERE id=?').run(parseDomains(b.domains).join(','), r.id);
  if (b.name !== undefined && String(b.name).trim()) q('UPDATE rooms SET name=? WHERE id=?').run(String(b.name).trim().slice(0, 80), r.id);
  return roomView(q('SELECT * FROM rooms WHERE id=?').get(r.id));
}, 'trainer');
function roomOr404(id) { const r = q('SELECT * FROM rooms WHERE id=?').get(id); if (!r) throw new HttpErr(404, 'Room not found'); return r; }
route('GET', /^\/api\/trainer\/rooms\/([\w-]+)$/, (req, b, m) => {
  expireDue(); const r = roomOr404(m[1]);
  const ps = q('SELECT * FROM participants WHERE room_id=? ORDER BY created_at').all(r.id);
  const atts = q('SELECT * FROM attempts WHERE room_id=? ORDER BY attempt_no').all(r.id);
  const counts = new Map(q('SELECT a.attempt_id id, COUNT(*) c FROM answers a JOIN attempts t ON t.id=a.attempt_id WHERE t.room_id=? GROUP BY a.attempt_id').all(r.id).map(x => [x.id, x.c]));
  const rank = new Map(rankedFirstAttempts(r.id).map((a, i) => [a.id, i + 1]));
  const rows = ps.map(p => {
    const mine = atts.filter(a => a.participant_id === p.id);
    const cur = mine[mine.length - 1];
    return {
      id: p.id, fullName: p.full_name, email: p.email, displayName: p.display_name, joinedAt: p.created_at,
      state: !cur ? 'joined' : connStatus(cur),
      attempts: mine.map(a => ({ id: a.id, no: a.attempt_no, status: connStatus(a), answered: counts.get(a.id) || 0, points: ['submitted', 'expired'].includes(a.status) ? a.points : null, correct: a.correct, startedAt: a.started_at, finishedAt: a.finished_at, lastSeen: a.last_seen, rank: rank.get(a.id) || null, recovered: !!a.recovered, offlineExpiry: !!a.offline_expiry })),
    };
  });
  const tally = { joined: 0, active: 0, reconnecting: 0, submitted: 0, expired: 0 };
  rows.forEach(r2 => { tally[r2.state] = (tally[r2.state] || 0) + 1; });
  return { room: roomView(r), tally, participants: rows, serverNow: now() };
}, 'trainer');
route('GET', /^\/api\/trainer\/attempts\/([\w-]+)$/, (req, b, m) => {
  expireDue();
  const att = q('SELECT * FROM attempts WHERE id=?').get(m[1]); if (!att) throw new HttpErr(404, 'Not found');
  const p = q('SELECT * FROM participants WHERE id=?').get(att.participant_id);
  const base = { participant: { fullName: p.full_name, email: p.email, displayName: p.display_name }, status: att.status };
  if (att.status === 'active') {
    const n = q('SELECT COUNT(*) c FROM answers WHERE attempt_id=?').get(att.id).c;
    return { ...base, answered: n, startedAt: att.started_at, deadline: att.deadline, lastSeen: att.last_seen };
  }
  return { ...base, ...resultView(att), startedAt: att.started_at };
}, 'trainer');
route('POST', /^\/api\/trainer\/participants\/([\w-]+)\/reset-resume$/, (req, b, m) => {
  const p = q('SELECT * FROM participants WHERE id=?').get(m[1]); if (!p) throw new HttpErr(404, 'Not found');
  const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[crypto.randomInt(32)]).join('');
  q('UPDATE participants SET resume_hash=? WHERE id=?').run(sha(code), p.id);
  return { resumeCode: code };
}, 'trainer');
route('GET', /^\/api\/trainer\/rooms\/([\w-]+)\/board$/, (req, b, m) => boardData(roomOr404(m[1])), 'trainer');
function boardData(r) {
  expireDue();
  const atts = q(`SELECT a.*, p.display_name FROM attempts a JOIN participants p ON p.id=a.participant_id WHERE a.room_id=? ORDER BY a.attempt_no`).all(r.id);
  const counts = new Map(q('SELECT a.attempt_id id, COUNT(*) c FROM answers a JOIN attempts t ON t.id=a.attempt_id WHERE t.room_id=? GROUP BY a.attempt_id').all(r.id).map(x => [x.id, x.c]));
  const joinedOnly = q(`SELECT display_name FROM participants WHERE room_id=? AND id NOT IN (SELECT participant_id FROM attempts)`).all(r.id).map(x => x.display_name);
  const view = (a) => {
    const answered = counts.get(a.id) || 0, done = a.status !== 'active';
    return { id: a.id, name: a.display_name, attemptNo: a.attempt_no, answered, checkpoint: done ? SESSIONS : Math.min(SESSIONS, Math.floor(answered / PER_SESSION) + 1), status: connStatus(a), lastSyncSec: Math.round((now() - (a.last_seen || a.started_at)) / 1000), lastProgress: a.last_progress || a.started_at,
      ...(done ? { points: a.points, pct: Math.round(a.correct / TOTAL * 1000) / 10, passed: a.correct / TOTAL * 100 >= r.pass_pct, durationMs: a.finished_at - a.started_at } : {}) };
  };
  const first = atts.filter(a => a.attempt_no === 1).map(view);
  const racing = first.filter(x => ['active', 'reconnecting'].includes(x.status)).concat(atts.filter(a => a.attempt_no > 1 && a.status === 'active').map(view));
  racing.sort((a, b2) => b2.answered - a.answered || a.lastProgress - b2.lastProgress);
  const finalists = rankedFirstAttempts(r.id).map((a, i) => ({ rank: i + 1, ...view(a) }));
  const retries = atts.filter(a => a.attempt_no > 1 && a.status !== 'active').map(view);
  const activeCount = atts.filter(a => a.status === 'active').length;
  return { room: { name: r.name, code: r.code, status: r.status, passPct: r.pass_pct }, serverNow: now(), provisional: activeCount > 0 || r.status === 'open', racing, finalists, retries, waiting: joinedOnly, totals: { active: activeCount, submitted: finalists.length } };
}
route('POST', /^\/api\/trainer\/rooms\/([\w-]+)\/import$/, (req, b, m) => {
  const r = roomOr404(m[1]); const f = b.file || b;
  if (f.kind !== 'mission-mediq-recovery' || !f.attemptId) throw bad('Not a Mission MedIQ recovery file.');
  const att = q('SELECT * FROM attempts WHERE id=? AND room_id=?').get(f.attemptId, r.id);
  if (!att) throw bad('This recovery file does not belong to this room.');
  if (f.sig !== hmac(`rec.${att.id}.${att.participant_id}`)) throw bad('Recovery file signature is not valid.');
  if (att.final_sync) throw bad('This attempt already has a verified online submission. Nothing imported.');
  const rows = (f.answers || []).map(a => ({ qid: a.qid, choice: a.choice, seq: a.seq, elapsedMs: a.elapsedMs }));
  applyAnswers({ ...att, status: 'active', deadline: Number.MAX_SAFE_INTEGER, started_at: att.started_at }, rows, true);
  const el = Math.min(+f.finalElapsedMs || (att.deadline - att.started_at), att.deadline - att.started_at);
  scoreAttempt(att.id, 'submitted', att.started_at + el, { recovered: true, offline: now() > att.deadline });
  const out = q('SELECT * FROM attempts WHERE id=?').get(att.id);
  return { ok: true, correct: out.correct, points: out.points };
}, 'trainer');
route('GET', /^\/api\/trainer\/rooms\/([\w-]+)\/export\.xlsx$/, async (req, b, m, res) => {
  expireDue(); const r = roomOr404(m[1]);
  const buf = await buildWorkbook({ db, room: r, bank: BANK, passPct: r.pass_pct, points: POINTS, total: TOTAL, rank: rankedFirstAttempts(r.id).map(a => a.id) });
  const fname = `MissionMedIQ_${r.code}_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.xlsx`;
  res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${fname}"`, 'Cache-Control': 'no-store' });
  res.end(buf); return null;
}, 'trainer');

/* ---------- static + dispatch ---------- */
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
function serveStatic(req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/trainer') pathname = '/trainer.html';
  const f = path.normalize(path.join(PUB, pathname));
  if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' });
  fs.createReadStream(f).pipe(res);
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);
  try {
    if (req.method !== 'GET' && !/application\/json/.test(req.headers['content-type'] || '')) throw bad('JSON required');
    const rt = routes.find(r => r.method === req.method && r.re.test(url.pathname));
    if (!rt) throw new HttpErr(404, 'Unknown endpoint');
    if (rt.auth === 'trainer' && !trainerOk(req)) throw new HttpErr(401, 'Trainer sign-in required');
    const body = req.method === 'GET' ? {} : await readBody(req);
    const out = await rt.fn(req, body, rt.re.exec(url.pathname), res);
    if (out === null) return;
    const { headers, ...rest } = out && out.headers ? out : { headers: {}, ...out };
    send(res, 200, rest, headers || {});
  } catch (e) {
    if (e instanceof HttpErr) return send(res, e.code, { error: e.message, ...(e.extra || {}) });
    console.error(e); send(res, 500, { error: 'Server error' });
  }
});
if (require.main === module) {
  if (PROD && !process.env.TRAINER_PASSWORD_HASH) { console.error('Set TRAINER_PASSWORD_HASH (see README).'); process.exit(1); }
  if (!PROD && !process.env.TRAINER_PASSWORD_HASH && !process.env.TRAINER_PASSWORD) console.warn('No trainer password configured: trainer login disabled.');
  server.listen(PORT, () => console.log(`Mission MedIQ on :${PORT} (${ATTEMPT_MS / 60000} min attempts)`));
}
module.exports = { server };
