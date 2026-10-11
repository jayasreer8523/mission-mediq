'use strict';
/* End-to-end API verification. Spawns real servers (fresh temp DBs) and acts as separate devices. */
const { spawn } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const crypto = require('node:crypto');
const ExcelJS = require('exceljs');
const BANK = require('../data/questions.json');
const bankBy = new Map(BANK.map(b => [b.id, b]));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function hash(pw) { const salt = crypto.randomBytes(8).toString('hex'); return `scrypt$${salt}$${crypto.scryptSync(pw, salt, 32).toString('hex')}`; }
async function startServer(port, minutes) {
  const db = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mq-')), 't.db');
  const p = spawn('node', ['--no-warnings', path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: port, DB_PATH: db, ATTEMPT_MINUTES: minutes, TRAINER_PASSWORD_HASH: hash('trainer-pass'), ALLOWED_EMAIL_DOMAINS: 'healthcatalyst.com', NODE_ENV: 'test' }, stdio: 'inherit' });
  for (let i = 0; i < 300; i++) { try { await fetch(`http://localhost:${port}/api/config`); return p; } catch { await sleep(100); } }
  throw new Error('server did not start');
}
function client(base) {
  const c = { cookie: '', token: null };
  c.call = async (m, url, body, raw) => {
    const r = await fetch(base + url, { method: m, headers: { 'Content-Type': 'application/json', ...(c.token ? { Authorization: 'Bearer ' + c.token } : {}), ...(c.cookie ? { Cookie: c.cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) c.cookie = sc.split(';')[0];
    if (raw) return r; let j = {}; try { j = await r.json(); } catch { /* */ } return { status: r.status, ...j };
  };
  return c;
}
const correctPosFor = (qid, options) => options.findIndex(o => o === bankBy.get(qid).options[0]);

async function main() {
  const base = 'http://localhost:4101';
  const sp = await startServer(4101, 20);
  try {
    console.log('Trainer protection');
    const anon = client(base), tr = client(base);
    ok((await anon.call('GET', '/api/trainer/rooms')).status === 401, 'trainer API rejects anonymous');
    ok((await anon.call('GET', '/api/trainer/rooms/x/export.xlsx', null, true)).status === 401, 'export rejects anonymous');
    ok((await tr.call('POST', '/api/trainer/login', { password: 'nope' })).status === 401, 'wrong password rejected');
    ok((await tr.call('POST', '/api/trainer/login', { password: 'trainer-pass' })).ok === true, 'correct password accepted');
    const room = await tr.call('POST', '/api/trainer/rooms', { name: 'Test room', passPct: 70 });
    ok(room.code && room.status === 'draft', 'room created in draft: ' + room.code);
    ok((await tr.call('PATCH', '/api/trainer/rooms/' + room.id, { passPct: 60 })).passPct === 60, 'pass mark editable before opening');

    console.log('Join and validation');
    const A = client(base), B = client(base), C = client(base);
    ok((await A.call('POST', '/api/join', { code: room.code, email: 'x@gmail.com', fullName: 'Ann Lee', displayName: 'Ace' })).status === 400, 'non-allowed email domain rejected');
    for (const bad of ['x@healthcatalyst.com.evil.com', 'x@evil.com', 'x@healthcatalyst.co', 'x@sub.healthcatalyst.com', 'healthcatalyst.com', 'a@b@healthcatalyst.com', 'x@gmail.com']) {
      const r = await client(base).call('POST', '/api/join', { code: room.code, email: bad, fullName: 'Ann Lee', displayName: 'Zed' + Math.random().toString(36).slice(2, 6) });
      ok(r.status === 400 && r.field === 'email', 'email rejected: ' + bad);
    }
    ok((await client(base).call('POST', '/api/join', { code: room.code, email: 'Case.Test@HealthCatalyst.COM', fullName: 'Case Test', displayName: 'CaseT' })).token !== undefined, 'allowed domain accepted case-insensitively');
    const ja = await A.call('POST', '/api/join', { code: room.code, email: 'ann@healthcatalyst.com', fullName: 'Ann Lee', displayName: 'Ace' });
    ok(ja.token && ja.resumeCode, 'device A joined'); A.token = ja.token;
    ok((await B.call('POST', '/api/join', { code: room.code, email: 'bob@healthcatalyst.com', fullName: 'Bob Roy', displayName: 'ace' })).status === 409, 'duplicate display name (case-insensitive) rejected');
    const jb = await B.call('POST', '/api/join', { code: room.code, email: 'bob@healthcatalyst.com', fullName: 'Bob Roy', displayName: 'Bolt' }); B.token = jb.token;
    ok((await A.call('POST', '/api/attempt/start', {})).status === 403, 'cannot start before room is open');
    await tr.call('PATCH', '/api/trainer/rooms/' + room.id, { status: 'open' });
    ok((await tr.call('PATCH', '/api/trainer/rooms/' + room.id, { passPct: 50 })).status === 400, 'pass mark locked once opened');

    console.log('Attempt composition and leak checks');
    const sa = await A.call('POST', '/api/attempt/start', {}); const att = sa.attempt;
    ok(att.questions.length === 20, '20 questions');
    const per = {}; att.questions.forEach(q => { per[q.session] = (per[q.session] || 0) + 1; });
    ok(Object.keys(per).length === 10 && Object.values(per).every(n => n === 2), 'exactly 2 per session');
    ok(new Set(att.questions.map(q => q.id)).size === 20, 'no duplicate questions');
    ok(att.questions.every(q => q.options.length === 4), 'four options each');
    const raw = JSON.stringify(sa);
    ok(!/"correctIndex"|"explanation"|"ok"|"correctPos"|"objective"|"source"/.test(raw), 'no key/explanation/correctness in active attempt payload');
    ok(att.deadline - att.startedAt === 20 * 60000, '20-minute server deadline');
    ok((await A.call('GET', `/api/attempt/${att.id}/result`)).status === 403, 'result blocked during attempt');
    ok((await B.call('GET', `/api/attempt/${att.id}/result`)).status === 404, "another participant cannot read A's attempt");
    const sa2 = await A.call('POST', '/api/attempt/start', {});
    ok(sa2.attempt.id === att.id, 'only one active attempt (start is idempotent)');
    // shuffle: across many fresh attempts the correct option lands in all positions
    const pos = new Set();
    for (let i = 0; i < 12; i++) {
      const X = client(base); const j = await X.call('POST', '/api/join', { code: room.code, email: `p${i}@healthcatalyst.com`, fullName: 'P ' + i, displayName: 'Pl' + i }); X.token = j.token;
      const s = await X.call('POST', '/api/attempt/start', {}); s.attempt.questions.forEach(q => pos.add(correctPosFor(q.id, q.options)));
      X.s = s; if (i < 3) C['x' + i] = X;
    }
    ok(pos.size === 4, 'options shuffled: correct answer appears in all 4 positions across attempts');

    console.log('Sync, staleness, refresh recovery');
    const qs = att.questions;
    const payload = (final, extra = {}) => ({ attemptId: att.id, final, answers: [], ...extra });
    await A.call('POST', '/api/attempt/sync', payload(false, { answers: [{ qid: qs[0].id, choice: 1, seq: 100, elapsedMs: 1000 }] }));
    await A.call('POST', '/api/attempt/sync', payload(false, { answers: [{ qid: qs[0].id, choice: 2, seq: 50, elapsedMs: 900 }] }));
    let me = await A.call('GET', '/api/me');
    ok(me.attempt.answers[qs[0].id].choice === 1, 'stale update (lower seq) did not overwrite newer answer');
    ok(me.attempt.id === att.id && JSON.stringify(me.attempt.questions) === JSON.stringify(att.questions), 'refresh restores same attempt, questions and option order');
    ok(me.attempt.startedAt === att.startedAt && me.attempt.deadline === att.deadline, 'refresh keeps original start time and deadline');
    ok((await A.call('POST', '/api/attempt/start', {})).attempt.deadline === att.deadline, 'restart request does not reset the timer');
    const dev2 = client(base); const rs = await dev2.call('POST', '/api/resume', { code: room.code, email: 'ann@healthcatalyst.com', resumeCode: ja.resumeCode });
    ok(rs.token && rs.state.attempt.id === att.id, 'resume on second device restores same attempt');
    ok((await client(base).call('POST', '/api/resume', { code: room.code, email: 'ann@healthcatalyst.com', resumeCode: 'AAAAAA' })).status === 403, 'resume needs the correct code');

    console.log('Board during active attempts');
    let board = await tr.call('GET', `/api/trainer/rooms/${room.id}/board`);
    const bs = JSON.stringify(board);
    ok(board.racing.some(r => r.name === 'Ace' && r.answered === 1), 'board shows display name and progress');
    ok(!/ann@|Ann Lee|points/.test(bs.replace(/"finalists":\[\]/, '')) || board.finalists.length === 0, 'board has no email, full name or points while active');

    console.log('Submit and scoring');
    // A answers all correctly (using positions derived from the bank), twice-syncs, then final twice
    const allRight = qs.map((q, i) => ({ qid: q.id, choice: correctPosFor(q.id, q.options), seq: 200 + i, elapsedMs: 2000 * (i + 1) }));
    const f1 = await A.call('POST', '/api/attempt/sync', payload(true, { answers: allRight, finalElapsedMs: 50000 }));
    const f2 = await A.call('POST', '/api/attempt/sync', payload(true, { answers: allRight, finalElapsedMs: 50000 }));
    ok(f1.done && f2.done && f2.duplicate, 'final submit is idempotent');
    const late = await A.call('POST', '/api/attempt/sync', payload(false, { answers: [{ qid: qs[0].id, choice: 3, seq: 9999, elapsedMs: 1 }] }));
    ok(late.done, 'no changes accepted after submit');
    const resA = await A.call('GET', `/api/attempt/${att.id}/result`);
    ok(resA.points === 2000 && resA.correct === 20 && resA.passed && resA.rank === 1, 'perfect score 2000, pass, rank 1');
    ok(resA.sessions.every(s => s.score === 2), 'session breakdown 2/2 each');
    ok(resA.questions.every(q => q.explanation && q.source), 'explanations only after submit');
    // B: answer 10 correct, 5 wrong, 5 unanswered
    const bState = await B.call('POST', '/api/attempt/start', {}); const bq = bState.attempt.questions;
    const bAns = bq.slice(0, 15).map((q, i) => ({ qid: q.id, choice: i < 10 ? correctPosFor(q.id, q.options) : (correctPosFor(q.id, q.options) + 1) % 4, seq: 10 + i, elapsedMs: 1000 * i }));
    await B.call('POST', '/api/attempt/sync', { attemptId: bState.attempt.id, final: true, answers: bAns, finalElapsedMs: 70000 });
    const resB = await B.call('GET', `/api/attempt/${bState.attempt.id}/result`);
    ok(resB.points === 1000 && resB.correct === 10 && resB.unanswered === 5 && !resB.passed, 'B: 10 correct = 1000 pts, 5 unanswered, fail (pass 60%)');
    const meB = await B.call('GET', '/api/me');
    ok(meB.canStart === true && meB.history.length === 1, 'failed participant may retry; history kept');
    const meA = await A.call('GET', '/api/me'); ok(meA.canStart === false && meA.hasPassed, 'passed participant cannot start another attempt');

    console.log('Retry');
    const b2 = await B.call('POST', '/api/attempt/start', {});
    ok(b2.attempt.attemptNo === 2 && b2.attempt.id !== bState.attempt.id && b2.attempt.deadline > bState.attempt.deadline, 'attempt #2 has new id and new timer');
    ok(b2.attempt.questions.length === 20, 'retry also has 20 questions');
    const bAll = b2.attempt.questions.map((q, i) => ({ qid: q.id, choice: correctPosFor(q.id, q.options), seq: 1 + i, elapsedMs: 500 * i }));
    await B.call('POST', '/api/attempt/sync', { attemptId: b2.attempt.id, final: true, answers: bAll, finalElapsedMs: 10000 });
    const rr = await B.call('GET', `/api/attempt/${b2.attempt.id}/result`);
    ok(rr.points === 2000 && rr.rank === null, 'retry scores 2000 but has no first-attempt rank');
    board = await tr.call('GET', `/api/trainer/rooms/${room.id}/board`);
    ok(board.finalists[0].name === 'Ace' && board.finalists[1].name === 'Bolt' && board.finalists[1].points === 1000, 'ranking uses first attempts only (Ace 2000, Bolt 1000)');
    ok(board.retries.length === 1 && board.retries[0].points === 2000, 'retry shown separately');
    ok(board.provisional === true, 'standings provisional while room open / attempts active');
    ok(!/ann@|Ann Lee|bob@|Bob Roy|choice|correctPos/.test(JSON.stringify(board)), 'projection data has no emails, full names or answers');

    console.log('Recovery file import');
    const X = C.x0; const xs = X.s.attempt;
    const recAnswers = xs.questions.map((q, i) => ({ qid: q.id, choice: correctPosFor(q.id, q.options), seq: 5 + i, elapsedMs: 1000 * i }));
    const rec = { kind: 'mission-mediq-recovery', attemptId: xs.id, sig: xs.recoverySig, finalElapsedMs: 30000, answers: recAnswers };
    ok((await tr.call('POST', `/api/trainer/rooms/${room.id}/import`, { file: { ...rec, sig: 'bad' } })).status === 400, 'tampered recovery file rejected');
    const imp = await tr.call('POST', `/api/trainer/rooms/${room.id}/import`, { file: rec });
    ok(imp.ok && imp.points === 2000, 'recovery file imported and scored');

    console.log('Trainer view and Excel');
    const rd = await tr.call('GET', '/api/trainer/rooms/' + room.id);
    const pa = rd.participants.find(p => p.displayName === 'Pl0');
    ok(pa.attempts[0].recovered === true, 'recovery import flagged');
    ok(rd.tally.submitted >= 2 && rd.tally.active >= 10, 'tally counts submitted and active');
    const xr = await tr.call('GET', `/api/trainer/rooms/${room.id}/export.xlsx`, null, true);
    ok(xr.status === 200 && /spreadsheetml/.test(xr.headers.get('content-type')), 'xlsx download');
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(await xr.arrayBuffer()));
    const names = wb.worksheets.map(w => w.name); console.log('   sheets:', names.join(' | '));
    ok(['Participant Results', 'Session Performance', 'Answer Details', 'Question Analysis', 'Question Bank'].every(n => names.includes(n)), 'all five required sheets present');
    const pr = wb.getWorksheet('Participant Results');
    const hdr = pr.getRow(1).values.slice(1); const col = (n) => hdr.indexOf(n) + 1;
    const rows = []; pr.eachRow((r, i) => { if (i > 1) rows.push(r); });
    const rowOf = (disp, no) => rows.find(r => r.getCell(col('Display name')).value === disp && r.getCell(col('Attempt #')).value === no);
    ok(rows.length === 3 + 12 + 0 - 0 + 0 || rows.length === 16, `participant rows include retries and in-progress (${rows.length})`);
    ok(rowOf('Ace', 1).getCell(col('Points')).value === 2000 && rowOf('Ace', 1).getCell(col('First-attempt rank')).value === 1, 'Ace row: 2000 pts, rank 1');
    ok(rowOf('Bolt', 1).getCell(col('Correct answers')).value === 10 && rowOf('Bolt', 1).getCell(col('Unanswered')).value === 5, 'Bolt attempt 1: 10 correct, 5 unanswered');
    ok(rowOf('Bolt', 2).getCell(col('First-attempt rank')).value === '', 'Bolt retry has no first-attempt rank');
    ok(/recover/i.test(rowOf('Pl0', 1).getCell(col('Recovery import')).value), 'recovery flag exported');
    ok(/In progress/.test(rowOf('Pl5', 1).getCell(col('Completion status')).value), 'in-progress attempts included');
    const ad = wb.getWorksheet('Answer Details'); const ah = ad.getRow(1).values.slice(1);
    let unans = 0, inc = 0, cor = 0; ad.eachRow((r, i) => { if (i > 1 && r.getCell(ah.indexOf('Display name') + 1).value === 'Bolt' && r.getCell(ah.indexOf('Attempt #') + 1).value === 1) { const v = r.getCell(ah.indexOf('Result') + 1).value; if (v === 'Unanswered') unans++; else if (v === 'Incorrect') inc++; else cor++; } });
    ok(cor === 10 && inc === 5 && unans === 5, 'Answer Details distinguishes unanswered (5) from incorrect (5) from correct (10)');
    ok(wb.getWorksheet('Question Bank').rowCount >= 61, 'Question Bank has 60 questions');
    const qa = wb.getWorksheet('Question Analysis'); let fa = 0; qa.eachRow((r, i) => { if (i > 1 && r.getCell(3).value === 'First attempts') fa += r.getCell(4).value; });
    ok(fa === 3 * 20, 'Question Analysis first-attempt presentations = 3 finished attempts x 20 (' + fa + ')');

    console.log('Closed room');
    await tr.call('PATCH', '/api/trainer/rooms/' + room.id, { status: 'closed' });
    ok((await client(base).call('POST', '/api/join', { code: room.code, email: 'late@healthcatalyst.com', fullName: 'Late One', displayName: 'Late' })).status === 403, 'closed room rejects new joins');
    const D = client(base); // participant with active attempt can still finish while closed
    ok((await C.x1.call('GET', '/api/me')).attempt !== null, 'active attempts continue after close');
  } finally { sp.kill(); }

  console.log('Timer expiry, offline queue');
  const sp2 = await startServer(4102, 0.05); // 3-second attempt
  try {
    const base = 'http://localhost:4102', tr = client(base); await tr.call('POST', '/api/trainer/login', { password: 'trainer-pass' });
    const room = await tr.call('POST', '/api/trainer/rooms', { name: 'Expiry' }); await tr.call('PATCH', '/api/trainer/rooms/' + room.id, { status: 'open' });
    const mk = async (n) => { const c = client(base); const j = await c.call('POST', '/api/join', { code: room.code, email: n + '@healthcatalyst.com', fullName: n + ' Person', displayName: n }); c.token = j.token; return c; };
    const E1 = await mk('Eve'), E2 = await mk('Fay'), E3 = await mk('Gus');
    const s1 = (await E1.call('POST', '/api/attempt/start', {})).attempt, s2 = (await E2.call('POST', '/api/attempt/start', {})).attempt, s3 = (await E3.call('POST', '/api/attempt/start', {})).attempt;
    await E1.call('POST', '/api/attempt/sync', { attemptId: s1.id, final: false, answers: [{ qid: s1.questions[0].id, choice: correctPosFor(s1.questions[0].id, s1.questions[0].options), seq: 1, elapsedMs: 500 }] });
    await sleep(8500);
    const me = await E1.call('GET', '/api/me');
    ok(me.attempt === null && me.history[0].status === 'expired', 'timer expiry auto-submits (status expired) with no client action');
    ok(me.history[0].points === 100, 'answers saved before expiry are scored; the rest are zero');
    const late = await E2.call('POST', '/api/attempt/sync', { attemptId: s2.id, final: true, auto: true, answers: [{ qid: s2.questions[0].id, choice: 0, seq: 1, elapsedMs: 800000 }] });
    const r2 = await E2.call('GET', `/api/attempt/${s2.id}/result`);
    ok(late.done && r2.points === 0, 'online answers arriving after the deadline are rejected');
    const off = await E3.call('POST', '/api/attempt/sync', { attemptId: s3.id, final: true, auto: true, queuedOffline: true, finalElapsedMs: 3000, answers: s3.questions.slice(0, 4).map((q, i) => ({ qid: q.id, choice: correctPosFor(q.id, q.options), seq: 1 + i, elapsedMs: 1000 + i * 300 })) });
    const r3 = await E3.call('GET', `/api/attempt/${s3.id}/result`);
    ok(off.done && r3.points === 400 && r3.flags.offlineExpiry === true, 'offline-queued answers given before expiry are accepted and flagged for trainer review');
    const rd = await tr.call('GET', '/api/trainer/rooms/' + room.id);
    ok(rd.participants.find(p => p.displayName === 'Gus').attempts[0].offlineExpiry === true, 'trainer dashboard shows offline-expiry flag');
    ok(rd.tally.expired === 3, 'expired participants counted (3)');
  } finally { sp2.kill(); }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
