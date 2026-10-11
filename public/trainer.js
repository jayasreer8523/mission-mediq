'use strict';
const app = $('#app');
let timers = [], defaultDomains = [];
const stop = () => { timers.forEach(clearInterval); timers = []; document.body.classList.remove('proj'); };
const T = (ms) => ms ? new Date(ms).toLocaleTimeString() : '-';
const go = (hash) => { location.hash = hash; };
async function init() {
  try { const m = await api('/api/trainer/me'); defaultDomains = m.defaultDomains; router(); } catch (e) { login(); }
}
addEventListener('hashchange', () => { if (!$('#loginform')) router(); });
function router() {
  stop();
  const [, a, id] = location.hash.split('/');
  if (a === 'room' && id) return roomPage(id);
  if (a === 'board' && id) return boardPage(id);
  return roomsPage();
}
function login() {
  stop(); const err = h('div', { class: 'err', role: 'alert' });
  app.replaceChildren(h('div', { class: 'wrap' }, h('div', { class: 'card', style: 'max-width:420px;margin:60px auto' }, h('h1', {}, 'Trainer sign-in'),
    h('form', { id: 'loginform', onsubmit: async (e) => { e.preventDefault(); err.textContent = ''; try { await api('/api/trainer/login', { body: { password: $('#pw').value } }); const m = await api('/api/trainer/me'); defaultDomains = m.defaultDomains; $('#loginform') && (document.getElementById('loginform').id = 'x'); router(); } catch (ex) { err.textContent = ex.message; } } },
      h('label', { for: 'pw' }, 'Password'), h('input', { id: 'pw', type: 'password', autocomplete: 'current-password', required: true }), err, h('button', { class: 'btn', type: 'submit' }, 'Sign in')))));
  $('#pw').focus();
}
const origin = () => location.origin;
async function guard(fn) { try { return await fn(); } catch (e) { if (e.status === 401) { login(); return null; } alert(e.message); return null; } }

/* ---------- rooms ---------- */
async function roomsPage() {
  const rooms = await guard(() => api('/api/trainer/rooms')); if (!rooms) return;
  const name = h('input', { id: 'rn', placeholder: 'e.g. Batch 12, October' }), pass = h('input', { id: 'rp', type: 'number', min: 0, max: 100, value: 70 }), doms = h('input', { id: 'rd', value: defaultDomains.join(', ') });
  app.replaceChildren(h('div', { class: 'wrap' },
    h('div', { class: 'row' }, h('h1', {}, 'Mission MedIQ: Trainer'), h('div', { class: 'sp' }), h('button', { class: 'btn sec sm', onclick: async () => { await api('/api/trainer/logout', { body: {} }); login(); } }, 'Sign out')),
    h('div', { class: 'card' }, h('h2', {}, 'Create a room'), h('div', { class: 'grid2' }, h('div', {}, h('label', { for: 'rn' }, 'Room name'), name), h('div', {}, h('label', { for: 'rp' }, 'Pass mark (%), can be changed until the room is opened'), pass)),
      h('label', { for: 'rd' }, 'Allowed email domains (comma separated)'), h('div', { class: 'hint' }, 'A basic domain check only. It does not verify who is typing the email.'), doms,
      h('p', {}, h('button', { class: 'btn', onclick: () => guard(async () => { const r = await api('/api/trainer/rooms', { body: { name: name.value, passPct: +pass.value, domains: doms.value } }); go('/room/' + r.id); }) }, 'Create room'))),
    h('div', { class: 'card' }, h('h2', {}, 'Your rooms'), rooms.length ? h('table', {}, h('thead', {}, h('tr', {}, ['Room', 'Code', 'Status', 'Players', 'Active', ''].map(x => h('th', {}, x)))),
      h('tbody', {}, rooms.map(r => h('tr', {}, h('td', {}, r.name), h('td', {}, h('b', {}, r.code)), h('td', {}, h('span', { class: 'tag ' + (r.status === 'open' ? 'active' : '') }, r.status)), h('td', {}, r.participants), h('td', {}, r.active), h('td', {}, h('button', { class: 'btn sm', onclick: () => go('/room/' + r.id) }, 'Manage')))))) : h('p', { class: 'hint' }, 'No rooms yet.'))));
}

/* ---------- room dashboard ---------- */
async function roomPage(id) {
  const holder = h('div'); app.replaceChildren(h('div', { class: 'wrap' }, holder));
  let open = new Set();
  const draw = async () => {
    const d = await guard(() => api('/api/trainer/rooms/' + id)); if (!d) return;
    const r = d.room, link = `${origin()}/?room=${r.code}`;
    const act = (status) => h('button', { class: 'btn ' + (status === 'closed' ? 'warn' : ''), onclick: () => guard(async () => { await api('/api/trainer/rooms/' + id, { method: 'PATCH', body: { status } }); draw(); }) }, status === 'open' ? (r.status === 'closed' ? 'Re-open room' : 'Open room for play') : 'Close room to new starts');
    const imp = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none', onchange: async (e) => { const f = e.target.files[0]; if (!f) return; try { const j = JSON.parse(await f.text()); const out = await api(`/api/trainer/rooms/${id}/import`, { body: { file: j } }); alert(`Imported: ${out.correct}/20 correct. Marked as a recovery import.`); draw(); } catch (ex) { alert(ex.message); } e.target.value = ''; } });
    holder.replaceChildren(
      h('div', { class: 'row' }, h('a', { href: '#/' }, '< All rooms'), h('div', { class: 'sp' }), h('button', { class: 'btn sec sm', onclick: () => go('/board/' + id) }, 'Open projection screen'), h('a', { class: 'btn sm', href: `/api/trainer/rooms/${id}/export.xlsx` }, 'Download Excel results')),
      h('div', { class: 'card' }, h('h1', {}, r.name), h('div', { class: 'row' }, h('span', { class: 'tag ' + (r.status === 'open' ? 'active' : '') }, 'Room ' + r.status), h('span', {}, `Pass mark ${r.passPct}%`), h('span', { class: 'hint' }, 'Domains: ' + (r.domains.join(', ') || 'any'))),
        h('p', {}, 'Room code: ', h('b', { style: 'font-size:1.6rem;letter-spacing:.15em' }, r.code)), h('p', {}, 'Participant link: ', h('a', { href: link, target: '_blank' }, link), ' ', h('button', { class: 'btn sm sec', onclick: () => navigator.clipboard && navigator.clipboard.writeText(link) }, 'Copy')),
        h('div', { class: 'row' }, r.status !== 'open' ? act('open') : null, r.status === 'open' ? act('closed') : null,
          r.status === 'draft' ? h('span', { class: 'row' }, h('label', { for: 'pm', style: 'margin:0' }, 'Pass mark %'), h('input', { id: 'pm', type: 'number', min: 0, max: 100, value: r.passPct, style: 'width:90px', onchange: (e) => guard(async () => { await api('/api/trainer/rooms/' + id, { method: 'PATCH', body: { passPct: +e.target.value } }); draw(); }) })) : null,
          h('button', { class: 'btn sec', onclick: () => imp.click() }, 'Import recovery file'), imp)),
      h('div', { class: 'card' }, h('div', { class: 'row' }, ...Object.entries(d.tally).map(([k, v]) => h('span', { class: 'tag ' + k }, `${k}: ${v}`)), h('div', { class: 'sp' }), h('span', { class: 'hint' }, 'Updated ' + T(d.serverNow))),
        h('table', {}, h('thead', {}, h('tr', {}, ['Name', 'Email', 'Display', 'State', 'Attempts', ''].map(x => h('th', {}, x)))),
          h('tbody', {}, d.participants.flatMap(p => [h('tr', {}, h('td', {}, p.fullName), h('td', {}, p.email), h('td', {}, p.displayName), h('td', {}, h('span', { class: 'tag ' + p.state }, p.state)),
            h('td', {}, p.attempts.map(a => h('span', { style: 'margin-right:8px' }, `#${a.no}: ${a.points === null ? a.answered + '/20 answered' : a.points + ' pts'}${a.rank ? ' (rank ' + a.rank + ')' : ''}${a.recovered ? ' [recovered]' : ''}${a.offlineExpiry ? ' [offline expiry: review]' : ''}`)).concat(p.attempts.length ? [] : ['-'])),
            h('td', {}, h('button', { class: 'btn sm sec', onclick: () => { open.has(p.id) ? open.delete(p.id) : open.add(p.id); draw(); } }, open.has(p.id) ? 'Hide' : 'Details'))),
          open.has(p.id) ? h('tr', {}, h('td', { colspan: 6 }, h('div', { id: 'd' + p.id }, 'Loading...'))) : null].filter(Boolean)))), d.participants.length ? null : h('p', { class: 'hint' }, 'Nobody has joined yet. Share the link or code.')));
    for (const pid of open) { const p = d.participants.find(x => x.id === pid); if (p) detail(p); }
  };
  async function detail(p) {
    const box = $('#d' + p.id); if (!box) return; box.replaceChildren();
    for (const a of p.attempts) {
      const R = await guard(() => api('/api/trainer/attempts/' + a.id)); if (!R) continue;
      if (R.status === 'active') { box.append(h('p', {}, `Attempt #${a.no}: in progress, ${R.answered}/20 answered, last seen ${T(R.lastSeen)}.`)); continue; }
      box.append(h('div', { class: 'q' }, h('b', {}, `Attempt #${a.no}: ${R.points} pts, ${R.correct}/20 (${R.pct}%), ${R.passed ? 'Pass' : 'Fail'}, ${R.status}, ${fmtDur(R.duration)}`),
        R.flags.recovered ? h('span', { class: 'tag fail', style: 'margin-left:8px' }, 'Recovered import') : null, R.flags.offlineExpiry ? h('span', { class: 'tag reconnecting', style: 'margin-left:8px' }, 'Offline expiry: review') : null,
        h('div', { class: 'row', style: 'margin:6px 0' }, R.sessions.map(s => h('span', { class: 'tag' }, `S${s.session}: ${s.score}/2`))),
        h('details', {}, h('summary', {}, 'Answers'), h('table', {}, h('tbody', {}, R.questions.map(q => h('tr', {}, h('td', {}, q.id), h('td', {}, q.text), h('td', {}, q.choice === null ? 'Unanswered' : `${'ABCD'[q.choice]}. ${q.options[q.choice]}`), h('td', {}, q.ok ? 'Correct' : q.choice === null ? 'Unanswered' : 'Incorrect'))))))));
    }
    box.append(h('button', { class: 'btn sm sec', onclick: () => guard(async () => { const r = await api(`/api/trainer/participants/${p.id}/reset-resume`, { body: {} }); alert('New resume code for ' + p.displayName + ': ' + r.resumeCode); }) }, 'Reset resume code'));
  }
  await draw(); timers.push(setInterval(() => { if (!open.size) draw(); }, 10000));
}

/* ---------- projection ---------- */
async function boardPage(id) {
  document.body.classList.add('proj');
  const holder = h('div', { class: 'wrap' }); app.replaceChildren(holder);
  const draw = async () => {
    const d = await guard(() => api(`/api/trainer/rooms/${id}/board`)); if (!d) return;
    const n = d.racing.length, cols = n > 40 ? 'c3' : n > 14 ? 'c2' : '';
    const lane = (p) => {
      const pct = Math.min(100, p.answered / 20 * 100);
      return h('div', { class: 'lane' }, h('div', { class: 'nm' }, p.name + (p.attemptNo > 1 ? ` (try ${p.attemptNo})` : '')),
        h('div', { class: 'track', role: 'img', 'aria-label': `${p.name}: ${p.answered} of 20 answered, checkpoint ${p.checkpoint}` }, h('div', { class: 'fill', style: `width:${pct}%` }), ...Array.from({ length: 9 }, (_, i) => h('i', { class: 'gate', style: `left:${(i + 1) * 10}%` })), h('div', { class: 'me', style: `left:${pct}%`, html: '' })),
        h('div', { class: 'st' }, `${p.answered}/20 | CP ${p.checkpoint}`, h('br'), p.status === 'reconnecting' ? 'reconnecting' : `synced ${p.lastSyncSec}s ago`));
    };
    const racing = d.racing.map(lane); racing.forEach(el => { $('.me', el).innerHTML = agentSVG(n > 14 ? 24 : 34, '#27d7c4'); });
    holder.replaceChildren(
      h('div', { class: 'row' }, h('h1', { style: 'font-size:2.2rem' }, 'MISSION MEDIQ'), h('span', { style: 'font-size:1.4rem' }, d.room.name), h('div', { class: 'sp' }), h('span', { style: 'font-size:1.6rem;font-weight:800' }, 'Join: ' + d.room.code), h('a', { href: '#/room/' + id, class: 'btn sec sm' }, 'Back')),
      h('div', { class: 'hint' }, `Last refresh ${T(d.serverNow)} (updates every 10 s)  |  ${d.totals.active} racing, ${d.totals.submitted} finished  |  ${d.provisional ? 'Standings are provisional until all active missions finish.' : 'Final standings'}`),
      h('h2', {}, 'The race'), h('div', { class: 'cols ' + cols + (n > 14 ? ' compact' : '') }, racing.length ? racing : h('p', { class: 'hint' }, 'Nobody is racing right now.')),
      d.waiting.length ? h('div', { class: 'hint' }, 'In the briefing room: ' + d.waiting.join(', ')) : null,
      d.finalists.length ? h('div', {}, h('h2', {}, 'Mission results: first attempts'), h('div', { class: 'podium' },
        h('div', { class: 'r', style: 'color:var(--mut);font-size:.9rem' }, h('span', {}, 'RANK'), h('span', {}, 'PLAYER'), h('span', {}, 'POINTS'), h('span', {}, 'SCORE'), h('span', {}, 'OUTCOME')),
        ...d.finalists.slice(0, 30).map(f => h('div', { class: 'r' }, h('b', {}, '#' + f.rank), h('span', {}, f.name), h('b', {}, f.points.toLocaleString()), h('span', {}, f.pct + '%'), h('span', { class: 'tag ' + (f.passed ? 'pass' : 'fail') }, f.passed ? 'Complete' : 'Not yet'))),
        d.finalists.length > 30 ? h('div', { class: 'hint' }, `+ ${d.finalists.length - 30} more`) : null)) : null,
      d.retries.length ? h('div', {}, h('h2', {}, 'Retry scores (not ranked)'), h('div', { class: 'hint' }, d.retries.map(r => `${r.name} try ${r.attemptNo}: ${r.points} pts`).join('   |   '))) : null);
  };
  await draw(); timers.push(setInterval(draw, 10000));
}
init();
