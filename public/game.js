'use strict';
/* Mission MedIQ participant app. No correctness information exists on the client during an attempt:
   the server sends only question text and shuffled options. */
const app = $('#app');
const LS = { get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }, del: (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } } };
let S = { token: null, code: null, offset: 0, state: null, att: null, online: true, timers: [], scene: null, lastSeq: 0 };

const clearTimers = () => { S.timers.forEach(clearInterval); S.timers = []; if (S.scene) { S.scene.stop(); S.scene = null; } };
const srvNow = () => Date.now() + S.offset;
function setOffset(serverNow) { if (serverNow) S.offset = serverNow - Date.now(); }
function shell(...kids) {
  clearTimers(); app.replaceChildren(h('div', { class: 'wrap' }, h('div', { class: 'brand' }, h('span', { class: 'logo', html: '' }), 'MISSION MEDIQ'), ...kids));
  $('.brand .logo').innerHTML = agentSVG(34);
}
function soundBtn() { const b = h('button', { class: 'btn sec sm', 'aria-pressed': 'false', onclick: () => { const on = Sound.toggle(); b.textContent = on ? 'Sound: on' : 'Sound: off'; b.setAttribute('aria-pressed', on); } }, Sound.on ? 'Sound: on' : 'Sound: off'); return b; }

/* ---------------- entry ---------------- */
function qCode() { const u = new URL(location.href); return (u.searchParams.get('room') || location.hash.replace('#', '') || '').toUpperCase().trim(); }
async function boot() {
  const saved = LS.get('mq_session');
  const code = qCode();
  if (saved && (!code || saved.code === code)) { S.token = saved.token; S.code = saved.code; try { return await refresh(); } catch (e) { if (e.status === 401) LS.del('mq_session'); else return offlineStart(); } }
  entry(code);
}
function offlineStart() { shell(h('div', { class: 'card' }, h('h2', {}, 'No connection'), h('p', {}, 'Mission MedIQ needs the internet to load. Check your connection and try again. Your answers are safe on this device and on the server.'), h('button', { class: 'btn', onclick: () => boot() }, 'Try again'))); }
function entry(code) {
  let mode = 'join';
  const box = h('div');
  const render = () => {
    const err = h('div', { class: 'err', role: 'alert' });
    const f = (id, label, type = 'text', hint, extra = {}) => [h('label', { for: id }, label), hint ? h('div', { class: 'hint', id: id + 'h' }, hint) : null, h('input', { id, type, autocomplete: type === 'email' ? 'email' : 'off', 'aria-describedby': hint ? id + 'h' : null, ...extra })];
    const form = h('form', { onsubmit: async (e) => {
      e.preventDefault(); err.textContent = '';
      const v = (id) => $('#' + id).value.trim();
      try {
        // company-domain gate: stop here, before anything is sent to join, if the email is not an allowed Health Catalyst address
        const info = await api('/api/room/' + encodeURIComponent(v('code')));
        const em = v('email').toLowerCase(), dom = em.includes('@') ? em.split('@').pop() : '';
        if (info.domains.length && !info.domains.includes(dom)) { const e = new Error('Use your Health Catalyst email (' + info.domains.map(d => '@' + d).join(', ') + '). Other email addresses cannot join.'); e.field = 'email'; throw e; }
        const r = mode === 'join'
          ? await api('/api/join', { body: { code: v('code'), email: v('email'), fullName: v('full'), displayName: v('disp') } })
          : await api('/api/resume', { body: { code: v('code'), email: v('email'), resumeCode: v('rc') } });
        S.token = r.token; S.code = v('code').toUpperCase(); LS.set('mq_session', { token: r.token, code: S.code });
        S.state = r.state; setOffset(r.state.serverNow);
        if (r.resumeCode) { return showResumeCode(r.resumeCode); }
        route();
      } catch (ex) { err.textContent = ex.message; if (ex.field) { const el = $('#' + ({ email: 'email', fullName: 'full', displayName: 'disp' }[ex.field])); el && el.focus(); } }
    } },
      ...f('code', 'Room code', 'text', null, { value: code, maxlength: 10, style: 'text-transform:uppercase', required: true }),
      ...f('email', 'Health Catalyst email', 'email', null, { required: true }),
      ...(mode === 'join' ? [...f('full', 'Full name', 'text', 'Only your trainer sees this.', { required: true, maxlength: 80 }),
        ...f('disp', 'What should we call you?', 'text', 'Choose a display name that best suits your personality. This is the name other players will see!', { required: true, minlength: 2, maxlength: 20 })]
        : f('rc', 'Resume code', 'text', 'The 6-character code shown when you first joined.', { required: true, maxlength: 6, style: 'text-transform:uppercase' })),
      err, h('button', { class: 'btn', type: 'submit' }, mode === 'join' ? 'Join the mission room' : 'Resume my mission'));
    box.replaceChildren(h('div', { class: 'tabs', role: 'tablist' },
      h('button', { class: 'btn sm ' + (mode === 'join' ? '' : 'sec'), role: 'tab', 'aria-selected': mode === 'join', onclick: () => { mode = 'join'; render(); } }, 'New player'),
      h('button', { class: 'btn sm ' + (mode === 'resume' ? '' : 'sec'), role: 'tab', 'aria-selected': mode === 'resume', onclick: () => { mode = 'resume'; render(); } }, 'Resume on this device')), form);
  };
  render();
  shell(h('canvas', { id: 'hero', 'aria-hidden': 'true' }), h('div', { class: 'card' }, h('h1', {}, 'Your mission awaits'), h('p', { class: 'hint' }, 'Travel through ten checkpoints, one for each training session. Answer two questions at each. Your email must use an allowed company domain; that is a basic check, not identity verification.'), box));
  heroScene();
}
function heroScene() { const c = $('#hero'); if (!c) return; const sc = new Scene(c); sc.cruise = true; sc.gateTotal = 0; S.scene = sc; if (RM) sc.draw(); }
function showResumeCode(code) {
  shell(h('div', { class: 'card' }, h('h2', {}, 'You are in!'), h('p', {}, 'Save your resume code. You need it to continue on another device or after clearing your browser.'),
    h('div', { class: 'big center', style: 'letter-spacing:.25em' }, code), h('button', { class: 'btn', onclick: route }, 'Continue to briefing')));
}
async function refresh() { const st = await api('/api/me', { token: S.token }); S.state = st; setOffset(st.serverNow); route(); }
function route() {
  const st = S.state;
  if (st.attempt) return play(st.attempt);
  if (st.history.length) return lobby(true);
  lobby(false);
}

/* ---------------- briefing / lobby ---------------- */
function lobby(after) {
  const st = S.state, r = st.room, last = st.history[st.history.length - 1];
  const route10 = h('div', { class: 'route', 'aria-label': 'Ten checkpoint route' }, SESSION_NAMES.map((n, i) => h('span', { class: 'chip', title: n }, `${i + 1}. ${n}`)));
  const startBtn = h('button', { class: 'btn', onclick: startMission, disabled: !st.canStart }, after ? 'Start a new attempt' : 'Start Mission');
  const msg = h('p', { class: 'hint', role: 'status' });
  const upd = () => {
    const s = S.state;
    startBtn.disabled = !s.canStart;
    msg.textContent = s.hasPassed ? 'You have completed the mission. Well done!' : s.room.status === 'draft' ? 'Waiting for the trainer to open the room. This page updates by itself.' : s.room.status === 'closed' ? 'This room is closed to new starts.' : 'The room is open. Start when you are ready: the timer begins immediately.';
  };
  upd();
  shell(
    h('canvas', { id: 'hero', 'aria-hidden': 'true' }),
    h('div', { class: 'card' }, h('h1', {}, after ? 'Mission debrief' : 'Mission briefing'), h('p', {}, h('b', {}, st.participant.displayName), ' in room ', h('b', {}, r.name), ' (', r.code, ')'),
      after ? h('div', {}, h('h3', {}, 'Your attempts'), historyTable(st.history), h('p', { class: 'hint' }, 'Rankings use first attempts. Retry scores are shown separately.')) : null,
      h('h3', {}, 'The rules'),
      h('ul', {}, h('li', {}, `${r.minutes} minutes in total, starting when you press Start Mission. The clock is kept by the server: refreshing or going offline does not stop it.`),
        h('li', {}, '10 checkpoints, 2 questions each (20 questions). Each is multiple choice with one correct answer.'),
        h('li', {}, 'No feedback while you play. Correct answers, explanations and your score appear after you submit.'),
        h('li', {}, 'You can go back to checkpoints you have reached and change answers until you submit.'),
        h('li', {}, 'At the time limit your mission is submitted automatically. Unanswered questions score zero.'),
        h('li', {}, `100 points per correct answer (2,000 max). Pass mark: ${r.passPct}%. A wrong answer never removes you from the race.`),
        h('li', {}, 'If you do not pass you can try again with a fresh set of questions; your earlier attempts are kept.')),
      route10, msg, h('div', { class: 'row' }, startBtn, soundBtn(), after ? h('button', { class: 'btn sec', onclick: () => showResult(last.attemptId) }, 'View last result') : null)));
  heroScene();
  S.timers.push(setInterval(async () => { try { S.state = await api('/api/me', { token: S.token }); setOffset(S.state.serverNow); if (S.state.attempt) return play(S.state.attempt); upd(); } catch { /* ignore */ } }, 5000));
}
function historyTable(hist) {
  return h('table', {}, h('thead', {}, h('tr', {}, ['Attempt', 'Score', 'Result', ''].map(x => h('th', {}, x)))), h('tbody', {}, hist.map(x => h('tr', {}, h('td', {}, '#' + x.attemptNo), h('td', {}, `${x.points} pts (${x.correct}/20, ${x.pct}%)`), h('td', {}, h('span', { class: 'tag ' + (x.passed ? 'pass' : 'fail') }, x.passed ? 'Passed' : 'Not yet')), h('td', {}, h('button', { class: 'btn sm sec', onclick: () => showResult(x.attemptId) }, 'Review'))))));
}
async function startMission() { try { const st = await api('/api/attempt/start', { token: S.token, body: {} }); S.state = st; setOffset(st.serverNow); play(st.attempt); } catch (e) { alert(e.message); } }

/* ---------------- play ---------------- */
function play(att) {
  const key = 'mq_att_' + att.id;
  const local = LS.get(key) || { answers: {}, finalPending: false, queued: false };
  // merge: higher seq wins, so server and local never overwrite newer answers with stale ones
  const answers = {};
  for (const qid of new Set([...Object.keys(att.answers), ...Object.keys(local.answers)])) {
    const a = att.answers[qid], b = local.answers[qid]; answers[qid] = !a ? b : !b ? a : (b.seq > a.seq ? b : a);
  }
  S.att = { ...att, answers, key, queued: local.queued, finalPending: local.finalPending, submitting: false, locked: false, view: 'cp', cp: 0, reached: 0, status: 'active', lastSync: null };
  const A = S.att;
  A.reached = Math.min(9, firstIncompleteCp());
  A.cp = A.reached;
  persist();
  drawPlay();
  addEventListener('online', onNet); addEventListener('offline', onNet);
  tick();
}
const cps = () => S.att.questions.length / 2;
function firstIncompleteCp() { const A = S.att; for (let i = 0; i < cps(); i++) { if (!(A.answers[A.questions[2 * i].id] && A.answers[A.questions[2 * i + 1].id])) return i; } return cps() - 1; }
const cpDone = (i) => { const A = S.att; return !!(A.answers[A.questions[2 * i].id] && A.answers[A.questions[2 * i + 1].id]); };
const answeredCount = () => Object.keys(S.att.answers).length;
function persist() { const A = S.att; LS.set(A.key, { answers: A.answers, finalPending: A.finalPending, queued: A.queued }); }
function onNet() { if (S.att) { S.att.online = navigator.onLine; paintConn(); if (navigator.onLine) sync(false); } }

function drawPlay() {
  const A = S.att;
  clearTimers(); // timers re-added by caller on first draw only
  S.timers.push(setInterval(tick, 250)); S.timers.push(setInterval(() => sync(false), 10000));
  const timer = h('span', { class: 'timer', id: 'timer', role: 'timer', 'aria-label': 'Time remaining' }, '--:--');
  const conn = h('span', { class: 'pill on', id: 'conn', role: 'status' }, 'Synced');
  const hud = h('div', { class: 'hud' }, h('div', { class: 'in' }, h('div', { class: 'brand' }, h('span', { html: '' }), 'MEDIQ'), timer, h('span', { class: 'pill', id: 'prog' }, ''), h('span', { class: 'coinpill', title: 'Cosmetic coins: they do not affect your score' }, h('i'), h('b', { id: 'coins' }, '0')), conn, soundBtn()));
  $('span', hud).innerHTML = agentSVG(26);
  app.replaceChildren(hud, h('div', { class: 'wrap' }, h('canvas', { id: 'scene', 'aria-label': 'Animated mission route. Questions appear below.' }), h('div', { id: 'route', class: 'route' }), h('div', { id: 'main' })));
  S.scene = new Scene($('#scene'));
  S.scene.finalMode = A.cp === cps() - 1;
  Object.keys(A.answers).length; for (let i = 0; i < cps(); i++) if (cpDone(i)) S.scene.open.add(i);
  S.scene.stopAt(A.cp, true);
  paintRoute(); paintMain(); paintConn();
}
function paintRoute() {
  const A = S.att, r = $('#route'); r.replaceChildren();
  for (let i = 0; i < cps(); i++) {
    const open = i <= A.reached && !A.locked && A.status === 'active';
    r.append(h('button', { class: `chip ${open ? 'open' : ''} ${A.view === 'cp' && i === A.cp ? 'cur' : ''} ${cpDone(i) ? 'done' : ''}`, disabled: !open, 'aria-label': `Checkpoint ${i + 1}${cpDone(i) ? ', complete' : ''}`, onclick: () => gotoCp(i) }, String(i + 1)));
  }
  r.append(h('button', { class: `chip ${A.reached >= cps() - 1 && cpDone(cps() - 1) ? 'open' : ''} ${A.view === 'review' ? 'cur' : ''}`, disabled: !(A.reached >= cps() - 1 && cpDone(cps() - 1)) || A.locked, onclick: showReview }, 'Review & submit'));
}
function gotoCp(i) { const A = S.att; if (A.locked) return; A.view = 'cp'; A.cp = i; S.scene.finalMode = i === cps() - 1; S.scene.stopAt(i, true); paintRoute(); paintMain(); }
function paintMain() {
  const A = S.att, m = $('#main'); if (!m) return; m.replaceChildren();
  if (A.view !== 'cp') return;
  const i = A.cp, qs = [A.questions[2 * i], A.questions[2 * i + 1]];
  m.append(h('div', { class: 'card' }, h('h2', {}, `Checkpoint ${i + 1} of ${cps()}${i === cps() - 1 ? ' (final)' : ''}`), h('div', { class: 'hint' }, `Topic: ${SESSION_NAMES[qs[0].session - 1]}`),
    ...qs.map((q, qi) => {
      const sel = A.answers[q.id] ? A.answers[q.id].choice : -1;
      return h('fieldset', { class: 'q', style: 'margin:12px 0' }, h('legend', { class: 'stem' }, `Question ${qi + 1}. `), h('div', { class: 'stem' }, q.text),
        ...q.options.map((o, oi) => h('button', { class: 'opt' + (sel === oi ? ' sel' : ''), 'aria-pressed': sel === oi, 'data-k': q.id + ':' + oi, disabled: A.locked, onclick: () => choose(q.id, oi) }, h('span', { class: 'k' }, 'ABCD'[oi]), h('span', {}, o))));
    }),
    h('div', { class: 'row' }, i > 0 ? h('button', { class: 'btn sec', onclick: () => gotoCp(i - 1) }, 'Previous checkpoint') : null, h('div', { class: 'sp' }),
      h('button', { class: 'btn', disabled: !cpDone(i) || A.locked, id: 'next', onclick: nextCp }, i === cps() - 1 ? 'Finish: review & submit' : 'Unlock next checkpoint'))));
}
function choose(qid, oi) {
  const A = S.att; if (A.locked || A.status !== 'active') return;
  A.lastSeq = Math.max((A.lastSeq || 0) + 1, Date.now());
  A.answers[qid] = { choice: oi, seq: A.lastSeq, elapsedMs: Math.max(0, srvNow() - A.startedAt) };
  persist(); Sound.pick(); S.scene && S.scene.hop(); paintMain(); paintRoute(); paintProg();
  const again = document.querySelector(`[data-k="${qid}:${oi}"]`); if (again) again.focus();
}
function nextCp() {
  const A = S.att, i = A.cp; if (!cpDone(i)) return;
  Sound.gate(); S.scene.openGate(i);   // neutral animation: shown for completing a checkpoint, regardless of correctness
  S.scene.showBanner(`Checkpoint ${i + 1} complete`, 1200);
  if (i === cps() - 1) { A.reached = cps() - 1; return setTimeout(() => { S.scene.runTo(cps()); setTimeout(showReview, RM ? 0 : 1600); }, RM ? 0 : 700); }
  A.reached = Math.max(A.reached, i + 1); A.cp = i + 1; A.view = 'cp';
  const nextIsFinal = A.cp === cps() - 1; if (nextIsFinal) S.scene.finalMode = true;
  $('#main').replaceChildren(h('div', { class: 'card center' }, h('h2', {}, nextIsFinal ? 'Final checkpoint ahead...' : 'Running to the next checkpoint...')));
  S.scene.onArrive = () => { S.scene.onArrive = null; if (nextIsFinal) S.scene.showBanner('FINAL CHECKPOINT', 1600); paintRoute(); paintMain(); };
  S.scene.runTo(A.cp);
}
function showReview() {
  const A = S.att; A.view = 'review'; paintRoute(); const m = $('#main'); m.replaceChildren();
  const un = A.questions.filter(q => !A.answers[q.id]).length;
  m.append(h('div', { class: 'card' }, h('h2', {}, 'Review and submit'), h('p', {}, un ? `You have ${un} unanswered question${un > 1 ? 's' : ''}. Unanswered questions score zero.` : 'All 20 questions answered.'),
    h('div', { class: 'route' }, SESSION_NAMES.map((n, i) => h('button', { class: 'chip open' + (cpDone(i) ? ' done' : ''), disabled: i > A.reached, onclick: () => gotoCp(i) }, `${i + 1}. ${n}`))),
    h('p', { class: 'hint' }, 'Select a checkpoint to change answers. After you submit, answers cannot be changed.'),
    h('div', { class: 'row' }, h('button', { class: 'btn', id: 'submit', disabled: A.locked, onclick: () => confirmSubmit() }, 'Submit my mission'))));
}
function confirmSubmit() {
  const un = S.att.questions.filter(q => !S.att.answers[q.id]).length;
  const ov = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Confirm submit' }, h('div', { class: 'card' }, h('h2', {}, 'Submit your mission?'), h('p', {}, un ? `${un} question(s) are unanswered and will score zero.` : 'You will not be able to change your answers.'),
    h('div', { class: 'row' }, h('button', { class: 'btn sec', onclick: () => ov.remove() }, 'Keep checking'), h('button', { class: 'btn', onclick: () => { ov.remove(); submit(false); } }, 'Yes, submit'))));
  document.body.append(ov); $('button.btn:not(.sec)', ov).focus();
}

/* ---------------- timer, sync, submit ---------------- */
function tick() {
  const A = S.att; if (!A || !$('#timer')) return;
  const left = A.deadline - srvNow(), t = $('#timer'); t.textContent = fmtTime(left); t.className = 'timer' + (left < 60000 ? ' crit' : left < 300000 ? ' low' : '');
  paintProg();
  if (left <= 0 && !A.locked) { A.locked = true; submit(true); }
}
function paintProg() { const A = S.att, p = $('#prog'); if (A && p) p.textContent = `${answeredCount()}/20 answered`; const c = $('#coins'); if (c && S.scene) c.textContent = S.scene.coins; }
function paintConn() {
  const A = S.att, c = $('#conn'); if (!A || !c) return;
  const off = !navigator.onLine || A.syncFail;
  c.className = 'pill ' + (off ? 'off' : 'on'); c.textContent = off ? 'Offline: saving on this device' : A.lastSync ? 'Synced' : 'Connected';
}
function payload(final) {
  const A = S.att;
  return { attemptId: A.id, final, auto: !!A.auto, queuedOffline: !!A.queued, finalElapsedMs: Math.min(A.deadline - A.startedAt, Math.max(0, srvNow() - A.startedAt)),
    answers: Object.entries(A.answers).map(([qid, a]) => ({ qid, choice: a.choice, seq: a.seq, elapsedMs: a.elapsedMs || 0 })) };
}
let syncing = false;
async function sync(final) {
  const A = S.att; if (!A || (syncing && !final)) return null; syncing = true;
  try {
    const r = await api('/api/attempt/sync', { token: S.token, body: payload(final) });
    setOffset(r.serverNow); A.syncFail = false; A.queued = false; A.lastSync = Date.now(); persist(); paintConn();
    if (r.done && !final) { if (r.status !== 'active') { A.locked = true; return finish(); } }
    return r;
  } catch (e) {
    if (e.status === 401) { alert(e.message); LS.del('mq_session'); location.reload(); return null; }
    A.syncFail = true; A.queued = true; persist(); paintConn(); return null;
  } finally { syncing = false; }
}
async function submit(auto) {
  const A = S.att; if (A.submitting) return; A.auto = !!auto; A.submitting = true; A.locked = true; A.finalPending = true; persist();
  document.querySelectorAll('.opt,#next,#submit').forEach(b => { b.disabled = true; });
  const m = $('#main'); m.replaceChildren(h('div', { class: 'card center' }, h('h2', {}, auto ? 'Time is up! Submitting your mission...' : 'Submitting your mission...'), h('p', { id: 'subm', role: 'status' }, 'Syncing your answers.')));
  let tries = 0;
  const attempt = async () => {
    const r = await sync(true);
    if (r && r.done) { A.finalPending = false; persist(); return finish(); }
    tries++;
    $('#subm') && ($('#subm').textContent = 'The trainer has NOT received your result yet. Your answers are saved on this device. Retrying automatically...');
    if (tries >= 2 && !$('#recov')) m.append(h('div', { class: 'card' }, h('p', {}, 'You can also download a recovery file now. Give it to your trainer if the connection does not come back.'), h('button', { id: 'recov', class: 'btn warn', onclick: downloadRecovery }, 'Download recovery file')));
    setTimeout(attempt, Math.min(15000, 2000 * tries));
  };
  attempt();
}
function downloadRecovery() {
  const A = S.att, p = payload(true);
  const file = { kind: 'mission-mediq-recovery', version: 1, roomCode: S.code, attemptId: A.id, sig: A.recoverySig, savedAt: new Date().toISOString(), finalElapsedMs: p.finalElapsedMs, answers: p.answers };
  const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' }));
  const a = h('a', { href: url, download: `MissionMedIQ_recovery_${A.id}.json` }); document.body.append(a); a.click(); a.remove();
}
async function finish() { const id = S.att.id; removeEventListener('online', onNet); removeEventListener('offline', onNet); const st = await api('/api/me', { token: S.token }); S.state = st; await showResult(id, true); }

/* ---------------- result + replay ---------------- */
async function showResult(attemptId, replay) {
  let R; try { R = await api(`/api/attempt/${attemptId}/result`, { token: S.token }); } catch (e) { return alert(e.message); }
  if (replay && !RM) return runReplay(R); renderResult(R);
}
function runReplay(R) {
  clearTimers();
  const canvas = h('canvas', { id: 'scene', 'aria-hidden': 'true' }), label = h('div', { class: 'center big', id: 'rl', role: 'status', 'aria-live': 'polite' }, 'Mission replay');
  const skip = h('button', { class: 'btn sec sm', onclick: () => { done = true; clearTimeout(S.rt); S.scene && S.scene.stop(); renderResult(R); } }, 'Skip replay');
  shell(h('div', { class: 'card' }, canvas, label, h('div', { class: 'row' }, h('div', { class: 'sp' }), skip, soundBtn())));
  const sc = S.scene = new Scene(canvas); let done = false, streak = 0, best = 0, pts = 0;
  const q = R.questions; let i = 0;
  const step = () => {
    if (done) return; if (i >= 10) return endRun();
    sc.finalMode = i === 9; sc.onArrive = () => {
      sc.onArrive = null; const a = q[2 * i], b = q[2 * i + 1]; let ok = 0;
      [a, b].forEach(x => { if (x.ok) { ok++; streak++; best = Math.max(best, streak); pts += 100; } else streak = 0; });
      if (ok) { sc.boost(1500); sc.burst(sc.gatePos(i), 20 + ok * 15, ['#ffb340', '#27d7c4', '#fff']); Sound.boost(); } else Sound.gate();
      sc.openGate(i); $('#rl').textContent = `Checkpoint ${i + 1}: ${ok}/2   |   ${pts} pts` + (streak >= 3 ? `   |   Streak x${streak}` : '');
      i++; S.rt = setTimeout(step, 1300);
    };
    sc.runTo(i);
  };
  const endRun = () => { sc.runTo(10); sc.onArrive = () => { sc.onArrive = null; Sound.final(); sc.showBanner('MISSION FINISH', 1400); sc.burst(sc.gatePos(9) + 600, 80, ['#ffb340', '#27d7c4', '#ff5d8f', '#fff']); S.rt = setTimeout(() => !done && renderResult(R, best), 2000); }; };
  step();
}
function renderResult(R, bestStreak) {
  const pass = R.passed; let n = 0;
  const pts = h('div', { class: 'big' }, '0');
  const step = Math.max(1, Math.round(R.points / 40));
  if (!RM && R.points) { const iv = setInterval(() => { n = Math.min(R.points, n + step); pts.textContent = n.toLocaleString(); if (n >= R.points) clearInterval(iv); }, 30); S.timers.push(iv); } else pts.textContent = R.points.toLocaleString();
  const best = bestStreak !== undefined ? bestStreak : (() => { let s = 0, b = 0; R.questions.forEach(x => { s = x.ok ? s + 1 : 0; b = Math.max(b, s); }); return b; })();
  const mayRetry = S.state && S.state.canStart;
  shell(
    h('div', { class: 'card center' }, h('div', { class: 'hint' }, `Attempt #${R.attemptNo}${R.status === 'expired' ? ' (time ran out)' : ''}`), pts, h('div', {}, `of ${R.maxPoints.toLocaleString()} points  |  ${R.correct}/${R.total} correct  |  ${R.pct}%`),
      h('h2', {}, h('span', { class: 'tag ' + (pass ? 'pass' : 'fail') }, R.outcome)), h('p', { class: 'hint' }, `Pass mark ${R.passPct}%. Time used: ${fmtDur(R.duration)}. Best streak: ${best}.`),
      R.rank ? h('p', {}, `First-attempt rank so far: #${R.rank}. Final standings are provisional until everyone in the room has finished.`) : R.attemptNo > 1 ? h('p', { class: 'hint' }, 'Retry scores are shown separately and do not change first-attempt rankings.') : null,
      R.unanswered ? h('p', { class: 'hint' }, `${R.unanswered} question(s) were left unanswered (scored zero).`) : null),
    h('div', { class: 'card' }, h('h3', {}, 'Checkpoint breakdown'), ...R.sessions.map(s => h('div', { style: 'margin:8px 0' }, h('div', { class: 'row' }, h('span', {}, `${s.session}. ${SESSION_NAMES[s.session - 1]}`), h('div', { class: 'sp' }), h('b', {}, `${s.score}/${s.of}`)), h('div', { class: 'bar' }, h('i', { style: `width:${s.score / s.of * 100}%` }))))),
    h('div', { class: 'card' }, h('h3', {}, 'Your answers and explanations'), ...R.questions.map((q, i) => h('details', { class: 'q' }, h('summary', {}, `${q.ok ? '✓' : q.choice === null ? '–' : '✗'}  Q${i + 1} (Session ${q.session}): ${q.text}`),
      ...q.options.map((o, oi) => h('div', { class: 'opt ' + (oi === q.correctPos ? 'key ' : '') + (oi === q.choice ? (q.ok ? 'ok' : 'no') : '') }, h('span', { class: 'k' }, 'ABCD'[oi]), h('span', {}, o + (oi === q.choice ? '  (your answer)' : '') + (oi === q.correctPos ? '  (correct)' : '')))),
      q.choice === null ? h('p', { class: 'hint' }, 'You did not answer this question.') : null, h('div', { class: 'explain' }, q.explanation), h('div', { class: 'hint' }, `Objective: ${q.objective} | Source: ${q.source}`)))),
    h('div', { class: 'row' }, mayRetry ? h('button', { class: 'btn', onclick: startMission }, 'Try again with new questions') : null, h('button', { class: 'btn sec', onclick: () => { S.state && lobby(true); } }, 'Back to debrief')));
}
boot();
