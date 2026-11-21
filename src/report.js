import { MOOD, MOODS, CARE } from './config.js';
import { esc, dayKey, fmtDate, fmtTime } from './utils.js';
import { vibe, level, inRange, stats, insightsList, topMood } from './analytics.js';

export const rangeLabel = (r) => (r === 'all' ? 'All time' : 'Last ' + r + ' days');

export function reportHTML(entries, r, name) {
  const list = inRange(entries, r);
  const o = stats(list);
  const tm = topMood(o);
  const lv = level(o.vibe);
  const gen = new Date().toLocaleString();
  const maxDist = Math.max(1, ...Object.values(o.dist));

  const rows = list.slice().reverse().map((e) => {
    const m = MOOD[e.mood] || MOOD.meh;
    return `<tr><td>${esc(fmtDate(e.ts))}<br><small>${esc(fmtTime(e.ts))}</small></td><td>${m.e} ${esc(m.n)}</td><td class="c">${vibe(e)}</td><td class="c">${e.energy}</td><td class="c">${e.stress}</td><td class="c">${e.social}</td><td>${esc((e.tags || []).join(', '))}</td><td>${esc((e.care || []).join(', '))}</td><td>${esc(e.note || '')}</td></tr>`;
  }).join('');

  const mix = MOODS.filter((m) => o.dist[m.k] > 0).map((m) =>
    `<div class="bar"><span class="nm">${m.e} ${esc(m.n)}</span><span class="tr"><i style="width:${o.dist[m.k] / maxDist * 100}%;background:${m.c}"></i></span><b>${o.dist[m.k]}</b></div>`).join('');
  const ins = insightsList(o, list).map((t) => `<li>${t}</li>`).join('');
  const care = CARE.map((c) =>
    `<div class="bar"><span class="nm">${c[0]} ${esc(c[1])}</span><span class="tr"><i style="width:${o.n ? o.care[c[1]] / o.n * 100 : 0}%;background:linear-gradient(90deg,#7fe5c4,#5fc9ff)"></i></span><b>${o.care[c[1]]}</b></div>`).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Princess Mood Report – ${esc(name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Pacifico&family=Fredoka:wght@400;500;600&family=Dancing+Script:wght@600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{margin:0;font-family:'Fredoka',sans-serif;background:linear-gradient(135deg,#ffe3f1,#f1deff);color:#5b2650;padding:18px}
.pg{max-width:900px;margin:0 auto;background:#fff;border-radius:30px;padding:26px;box-shadow:0 14px 40px rgba(217,47,132,.2);border:4px solid #ffc2de}
.hd{text-align:center}.hd .cr{font-size:3rem}
h1{font-family:'Pacifico',cursive;font-weight:400;color:#d92f84;margin:0;font-size:1.8rem;line-height:1.3}
.sb{font-family:'Dancing Script',cursive;font-size:1.4rem;color:#a46d97}
h2{font-family:'Pacifico',cursive;font-weight:400;color:#d92f84;font-size:1.2rem;margin:26px 0 8px;border-bottom:3px dotted #ffc2de;padding-bottom:4px}
.kp{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:18px}
.k{background:linear-gradient(135deg,#fff0f8,#f1deff);border-radius:18px;padding:12px;text-align:center}
.k b{display:block;font-family:'Pacifico',cursive;font-size:1.6rem;color:#d92f84}.k span{font-size:.8rem;color:#a46d97}
.lv{text-align:center;background:linear-gradient(135deg,#ff7cbc,#c98bff);color:#fff;border-radius:20px;padding:14px;margin-top:16px;font-size:1.15rem}
.bar{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:.9rem}.bar .nm{width:170px;flex:none}.bar .tr{flex:1;height:14px;background:#fdeaf4;border-radius:99px;overflow:hidden}.bar i{display:block;height:100%;border-radius:99px}.bar b{width:30px;text-align:right}
ul{padding-left:20px}li{margin:6px 0}
.tw{overflow-x:auto;-webkit-overflow-scrolling:touch}
table{width:100%;min-width:640px;border-collapse:collapse;font-size:.8rem}th{background:#ff5fa8;color:#fff;padding:7px;text-align:left}td{padding:7px;border-bottom:1px solid #ffd9ec;vertical-align:top}td.c{text-align:center}tr:nth-child(even) td{background:#fff7fb}
.ft{text-align:center;margin-top:26px;font-family:'Dancing Script',cursive;font-size:1.3rem;color:#a46d97}
.pb{text-align:center;margin-top:14px}.pb button{font-family:inherit;background:#ff5fa8;color:#fff;border:0;padding:12px 24px;border-radius:99px;cursor:pointer;font-size:1rem}
@media print{body{background:#fff;padding:0}.pg{box-shadow:none;border:2px solid #ffc2de}.pb{display:none}.tw{overflow:visible}table{min-width:0}}
@media(max-width:600px){.pg{padding:18px;border-radius:24px}.kp{grid-template-columns:repeat(2,1fr)}.bar .nm{width:120px}}
</style></head><body><div class="pg">
<div class="hd"><div class="cr">👑</div><h1>SCS External Princess Mood Report</h1><div class="sb">for ${esc(name)} · ${esc(rangeLabel(r))}</div><div style="font-size:.8rem;color:#a46d97">Generated ${esc(gen)}</div></div>
${o.n ? `<div class="kp"><div class="k"><b>${o.n}</b><span>check-ins</span></div><div class="k"><b>${Math.round(o.vibe)}</b><span>avg vibe / 100</span></div><div class="k"><b>${o.energy.toFixed(1)}</b><span>avg energy</span></div><div class="k"><b>${o.stress.toFixed(1)}</b><span>avg stress</span></div></div>
<div class="lv">${esc(lv[0])}<br><small>${esc(lv[1])}${tm ? ' · Most common mood: ' + tm.e + ' ' + esc(tm.n) : ''}</small></div>
<h2>🔮 Royal Insights</h2><ul>${ins}</ul>
<h2>💗 Mood Mix</h2>${mix}
<h2>🧖‍♀️ Self-care Scoreboard</h2>${care}
<h2>📖 Diary Entries</h2><div class="tw"><table><thead><tr><th>Date</th><th>Mood</th><th>Vibe</th><th>⚡</th><th>😵‍💫</th><th>🦋</th><th>Factors</th><th>Self-care</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p style="text-align:center;font-family:'Dancing Script',cursive;font-size:1.6rem;margin:40px 0">No check-ins in this period yet 💕</p>`}
<div class="ft">Stay sparkly, princess ✨ · This report is for personal wellness tracking, not a medical assessment.</div>
<div class="pb"><button onclick="window.print()">🖨️ Print / Save as PDF</button></div>
</div></body></html>`;
}

export function csv(entries, r, name) {
  const list = inRange(entries, r);
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const head = ['Date', 'Time', 'Princess', 'Mood', 'Mood score (1-5)', 'Royal vibe (0-100)', 'Energy', 'Stress', 'Social battery', 'Factors', 'Self-care', 'Note'];
  const rows = list.map((e) => {
    const m = MOOD[e.mood] || MOOD.meh;
    return [dayKey(new Date(e.ts)), fmtTime(e.ts), name, m.n, m.s, vibe(e), e.energy, e.stress, e.social, (e.tags || []).join('; '), (e.care || []).join('; '), e.note || ''].map(q).join(',');
  });
  return '﻿' + [head.map(q).join(',')].concat(rows).join('\r\n');
}
