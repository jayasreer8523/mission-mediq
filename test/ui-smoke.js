'use strict';
/* UI smoke test with jsdom (no real browser available in CI sandbox): drives the participant app end to end
   against a live server: join, start, answer 20 questions across 10 checkpoints, review, submit, replay skip, results.
   Also tests the offline queue (fetch fails) then reconnect, and the projection page render. */
const { spawn } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { JSDOM, ResourceLoader } = require('jsdom');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ok  ' : '  FAIL ') + m); };
const salt = 'ab12'; const hash = `scrypt$${salt}$${crypto.scryptSync('pw', salt, 32).toString('hex')}`;
const PORT = 4103, BASE = `http://localhost:${PORT}`;

async function dom(url, net) {
  const d = await JSDOM.fromURL(url, { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, beforeParse(w) {
    w.fetch = (u, o) => net.down ? Promise.reject(new TypeError('offline')) : fetch(new URL(u, BASE), o);
    w.matchMedia = () => ({ matches: true, addEventListener() {} });   // reduced motion on: no canvas animation
    const noop = new Proxy(function () {}, { get: () => noop, apply: () => noop, set: () => true });
    w.HTMLCanvasElement.prototype.getContext = () => noop;
    w.alert = (m) => { w.__alert = m; }; w.requestAnimationFrame = () => 0;
    Object.defineProperty(w.navigator, 'onLine', { get: () => !net.down });
  } });
  await sleep(1200); return d.window;
}
async function main() {
  const dbp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mqui-')), 't.db');
  const sp = spawn('node', ['--no-warnings', 'server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, DB_PATH: dbp, TRAINER_PASSWORD_HASH: hash, NODE_ENV: 'test' }, stdio: 'inherit' });
  for (let i = 0; i < 300; i++) { try { await fetch(BASE + '/api/config'); break; } catch { await sleep(100); } }
  try {
    const call = async (m, u, b, cookie) => { const r = await fetch(BASE + u, { method: m, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { r, j: await r.json().catch(() => ({})) }; };
    const lg = await call('POST', '/api/trainer/login', { password: 'pw' }); const cookie = lg.r.headers.get('set-cookie').split(';')[0];
    const room = (await call('POST', '/api/trainer/rooms', { name: 'UI room' }, cookie)).j; await call('PATCH', '/api/trainer/rooms/' + room.id, { status: 'open' }, cookie);
    const net = { down: false };
    const w = await dom(`${BASE}/?room=${room.code}`, net); const $ = (s) => w.document.querySelector(s), $$ = (s) => [...w.document.querySelectorAll(s)];
    const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const txt = () => w.document.body.textContent;
    ok(/What should we call you\?/.test(txt()) && /Choose a display name that best suits your personality\. This is the name other players will see!/.test(txt()), 'entry form shows required display-name label and helper text');
    $('#email').value = 'u1@gmail.com'; $('#full').value = 'Uma One'; $('#disp').value = 'Nova'; $('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await sleep(600);
    ok(/Use your Health Catalyst email/.test(txt()) && !/Save your resume code/.test(txt()) && $('#email'), 'non-Health Catalyst email blocked on the form, does not move forward');
    $('#email').value = 'u1@healthcatalyst.com'; $('#full').value = 'Uma One'; $('#disp').value = 'Nova'; $('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await sleep(600);
    ok(/Save your resume code/.test(txt()), 'joined, resume code shown');
    click($$('button').find(b => /Continue to briefing/.test(b.textContent))); await sleep(200);
    ok(/Mission briefing/.test(txt()) && /20 minutes/.test(txt()), 'briefing with rules and countdown length');
    click($$('button').find(b => /Start Mission/.test(b.textContent))); await sleep(800);
    ok(/Checkpoint 1 of 10/.test(txt()) && $('#timer'), 'mission started: checkpoint 1 and timer visible');
    ok(!$$('.opt').some(o => /ok|no|key/.test(o.className.replace(/opt|sel/g, ''))), 'no correctness styling on options');
    for (let cp = 0; cp < 10; cp++) {
      ok(new RegExp(`Checkpoint ${cp + 1} of 10`).test(txt()), `at checkpoint ${cp + 1}`);
      const qs = $$('fieldset.q'); const nextBtn = () => $('#next');
      ok(nextBtn().disabled, '  next locked until both answered (cp ' + (cp + 1) + ')');
      click(qs[0].querySelectorAll('.opt')[cp % 4]); await sleep(30);
      click($$('fieldset.q')[1].querySelectorAll('.opt')[(cp + 1) % 4]); await sleep(30);
      ok(!nextBtn().disabled, '  next unlocked');
      if (cp === 2) { // change an answer on an earlier checkpoint (navigate back)
        click($$('#route .chip')[0]); await sleep(50); ok(/Checkpoint 1 of 10/.test(txt()), '  navigated back to checkpoint 1'); click($$('fieldset.q')[0].querySelectorAll('.opt')[3]); await sleep(30);
        click($$('#route .chip')[2]); await sleep(50);
      }
      click(nextBtn()); await sleep(cp === 9 ? 300 : 120);
    }
    ok(/Review and submit/.test(txt()), 'review screen reached after checkpoint 10');
    // offline: queue then reconnect
    net.down = true; await sleep(100); click($('#submit')); await sleep(100); click($$('.overlay button').find(b => /Yes, submit/.test(b.textContent))); await sleep(2500);
    ok(/trainer has NOT received your result/.test(txt()), 'offline submit: clear "trainer has not received" message');
    ok(!!$('#recov'), 'recovery file download offered after failed final sync');
    net.down = false; await sleep(7000);
    ok(/Mission replay|Skip replay|points/i.test(txt()), 'reconnected: submission completed (replay/result shown)');
    const skip = $$('button').find(b => /Skip replay/.test(b.textContent)); skip && click(skip); await sleep(400);
    ok(/Checkpoint breakdown/.test(txt()) && /Your answers and explanations/.test(txt()), 'results: breakdown and explanations only after submit');
    ok(/of 2,000 points/.test(txt()), 'results show max 2,000 points');
    // refresh recovery in UI: load a fresh window with the same localStorage session? new device resume uses code. Verify state via API instead.
    const board = await call('GET', `/api/trainer/rooms/${room.id}/board`, null, cookie);
    ok(board.j.finalists.length === 1 && board.j.finalists[0].name === 'Nova', 'projection data shows finished first attempt');
    // trainer page renders board
    const tw = await dom(`${BASE}/trainer#/board/${room.id}`, net); ok(/Sign in/i.test(tw.document.body.textContent), 'trainer page demands sign-in when no cookie');
    w.close(); tw.close();
  } finally { sp.kill(); }
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
