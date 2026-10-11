'use strict';
const ExcelJS = require('exceljs');

const iso = (t) => (t ? new Date(t).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '');
const L = ['A', 'B', 'C', 'D'];

function style(ws, widths) {
  ws.columns.forEach((c, i) => { c.width = widths[i] || 14; });
  const h = ws.getRow(1);
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } };
  h.alignment = { vertical: 'middle', wrapText: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
}

async function buildWorkbook({ db, room, bank, passPct, points, total, rank }) {
  const bankBy = new Map(bank.map(b => [b.id, b]));
  const parts = db.prepare('SELECT * FROM participants WHERE room_id=?').all(room.id);
  const pBy = new Map(parts.map(p => [p.id, p]));
  const atts = db.prepare('SELECT * FROM attempts WHERE room_id=? ORDER BY participant_id, attempt_no').all(room.id);
  const ansAll = db.prepare('SELECT a.* FROM answers a JOIN attempts t ON t.id=a.attempt_id WHERE t.room_id=?').all(room.id);
  const ansBy = new Map();
  ansAll.forEach(a => { if (!ansBy.has(a.attempt_id)) ansBy.set(a.attempt_id, new Map()); ansBy.get(a.attempt_id).set(a.qid, a); });
  const rankOf = new Map(rank.map((id, i) => [id, i + 1]));

  // per-attempt computed detail (live scoring from answers so in-progress attempts are included)
  const calc = atts.map(att => {
    const qs = JSON.parse(att.questions); const am = ansBy.get(att.id) || new Map();
    const rows = qs.map(({ id, order }) => {
      const b = bankBy.get(id), a = am.get(id);
      const correctPos = order.indexOf(b.correctIndex);
      return { id, b, order, a, correctPos, state: !a ? 'Unanswered' : a.choice === correctPos ? 'Correct' : 'Incorrect' };
    });
    const correct = rows.filter(r => r.state === 'Correct').length;
    return { att, rows, correct };
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Mission MedIQ'; wb.created = new Date();

  // 1 Participant Results
  const s1 = wb.addWorksheet('Participant Results');
  s1.addRow(['Room', 'Participant ID', 'Full name', 'Email', 'Display name', 'Attempt #', 'Correct answers', 'Answered', 'Unanswered', 'Percentage', 'Points', 'Pass/Fail', 'Completion status',
    'First-attempt rank', 'Start time', 'Finish time', 'Duration (mm:ss)', 'Recovery import', 'Offline-expiry (review)', 'Verified online final sync']);
  for (const { att, rows, correct } of calc) {
    const p = pBy.get(att.participant_id);
    const done = ['submitted', 'expired'].includes(att.status);
    const answered = rows.filter(r => r.a).length;
    const dur = done ? Math.round((att.finished_at - att.started_at) / 1000) : null;
    const pct = correct / total;
    s1.addRow([room.name + ' (' + room.code + ')', p.id, p.full_name, p.email, p.display_name, att.attempt_no, correct, answered, total - answered, pct, correct * points,
      done ? (pct * 100 >= passPct ? 'Pass' : 'Fail') : 'In progress (provisional)',
      att.status === 'submitted' ? 'Submitted' : att.status === 'expired' ? 'Expired (auto-submitted)' : 'In progress',
      att.attempt_no === 1 && rankOf.has(att.id) ? rankOf.get(att.id) : '', iso(att.started_at), done ? iso(att.finished_at) : '',
      dur === null ? '' : `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}`,
      att.recovered ? 'Yes - recovered file import' : 'No', att.offline_expiry ? 'Yes - offline expiry, review' : 'No', att.final_sync && !att.recovered ? 'Yes' : 'No']);
  }
  s1.getColumn(10).numFmt = '0.0%';
  style(s1, [22, 14, 22, 30, 16, 9, 10, 9, 11, 11, 8, 20, 22, 11, 22, 22, 12, 24, 24, 14]);

  // 2 Session Performance
  const s2 = wb.addWorksheet('Session Performance');
  s2.addRow(['Participant ID', 'Display name', 'Full name', 'Attempt #', ...Array.from({ length: 10 }, (_, i) => `S${i + 1} (of 2)`), 'Total (of 20)']);
  for (const { att, rows, correct } of calc) {
    const p = pBy.get(att.participant_id);
    s2.addRow([p.id, p.display_name, p.full_name, att.attempt_no, ...Array.from({ length: 10 }, (_, i) => rows.filter(r => r.b.session === i + 1 && r.state === 'Correct').length), correct]);
  }
  style(s2, [14, 16, 22, 9, ...Array(10).fill(9), 12]);

  // 3 Answer Details
  const s3 = wb.addWorksheet('Answer Details');
  s3.addRow(['Participant ID', 'Display name', 'Full name', 'Attempt #', 'Attempt status', 'Question ID', 'Session', 'Question text', 'Selected answer', 'Correct answer', 'Result', 'Approx. response time (s)', 'Answer given at (s from start)', 'First attempt?']);
  for (const { att, rows } of calc) {
    const p = pBy.get(att.participant_id);
    let prev = 0;
    const ordered = rows.slice().sort((a, b) => (a.a ? a.a.elapsed_ms : Infinity) - (b.a ? b.a.elapsed_ms : Infinity));
    const rt = new Map(); ordered.forEach(r => { if (r.a) { rt.set(r.id, Math.max(0, r.a.elapsed_ms - prev) / 1000); prev = r.a.elapsed_ms; } });
    for (const r of rows) {
      s3.addRow([p.id, p.display_name, p.full_name, att.attempt_no, att.status, r.id, r.b.session, r.b.text,
        r.a ? `${L[r.a.choice]}. ${r.b.options[r.order[r.a.choice]]}` : '(unanswered)', `${L[r.correctPos]}. ${r.b.options[r.b.correctIndex]}`, r.state,
        r.a ? Math.round(rt.get(r.id) * 10) / 10 : '', r.a ? Math.round(r.a.elapsed_ms / 100) / 10 : '', att.attempt_no === 1 ? 'Yes' : 'No']);
    }
  }
  style(s3, [14, 16, 22, 9, 12, 10, 8, 60, 45, 45, 12, 14, 14, 10]);
  s3.getColumn(8).alignment = { wrapText: true, vertical: 'top' }; s3.getColumn(9).alignment = { wrapText: true, vertical: 'top' }; s3.getColumn(10).alignment = { wrapText: true, vertical: 'top' };

  // 4 Question Analysis (finished attempts only; first attempts and retries separated)
  const s4 = wb.addWorksheet('Question Analysis');
  s4.addRow(['Question ID', 'Session', 'Cohort', 'Times presented', 'Answered', 'Unanswered', 'Correct', 'Correct rate (of presented)', 'Option A (n)', 'Option B (n)', 'Option C (n)', 'Option D (n)', 'Note']);
  for (const b of bank) {
    for (const cohort of ['First attempts', 'Retries']) {
      const sel = calc.filter(c => ['submitted', 'expired'].includes(c.att.status) && ((c.att.attempt_no === 1) === (cohort === 'First attempts')));
      let pres = 0, ans = 0, cor = 0; const dist = [0, 0, 0, 0];
      for (const c of sel) {
        const r = c.rows.find(x => x.id === b.id); if (!r) continue;
        pres++; if (r.a) { ans++; dist[r.a.choice]++; } if (r.state === 'Correct') cor++;
      }
      // option distribution is by displayed position (options are shuffled per attempt); also report by option text below
      s4.addRow([b.id, b.session, cohort, pres, ans, pres - ans, cor, pres ? cor / pres : '', ...dist, 'Counts are by displayed position (options are shuffled)']);
    }
  }
  s4.getColumn(8).numFmt = '0.0%';
  style(s4, [10, 8, 16, 12, 10, 11, 9, 14, 11, 11, 11, 11, 44]);

  // 4b distribution by option text, so the shuffled counts are meaningful
  const s4b = wb.addWorksheet('Question Option Distribution');
  s4b.addRow(['Question ID', 'Cohort', 'Option text', 'Is correct', 'Times chosen']);
  for (const b of bank) for (const cohort of ['First attempts', 'Retries']) {
    const sel = calc.filter(c => ['submitted', 'expired'].includes(c.att.status) && ((c.att.attempt_no === 1) === (cohort === 'First attempts')));
    b.options.forEach((txt, oi) => {
      let n = 0;
      for (const c of sel) { const r = c.rows.find(x => x.id === b.id); if (r && r.a && r.order[r.a.choice] === oi) n++; }
      s4b.addRow([b.id, cohort, txt, oi === b.correctIndex ? 'Yes' : 'No', n]);
    });
  }
  style(s4b, [10, 16, 80, 10, 12]);

  // 5 Question Bank
  const s5 = wb.addWorksheet('Question Bank');
  s5.addRow(['Question ID', 'Session', 'Type', 'Learning objective', 'Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct option (as written in bank)', 'Explanation', 'Source slide']);
  for (const b of bank) s5.addRow([b.id, b.session, b.type, `${b.objectiveNumber}. ${b.objective}`, b.text, ...b.options, `${L[b.correctIndex]}. ${b.options[b.correctIndex]}`, b.explanation, b.source]);
  style(s5, [10, 8, 14, 40, 60, 40, 40, 40, 40, 40, 60, 40]);
  s5.eachRow((r, i) => { if (i > 1) r.alignment = { wrapText: true, vertical: 'top' }; });
  s5.addRow([]);
  s5.addRow(['Note: the bank lists the correct answer in the first option; each attempt shuffles the displayed order.']);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
module.exports = { buildWorkbook };
