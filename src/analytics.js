import { MOOD, MOODS, TAGS, CARE } from './config.js';
import { esc, dayKey, avg, WD } from './utils.js';

// Royal vibe score, 0–100: mood (50%) + energy (20%) + calm (20%) + social battery (10%).
export function vibe(e) {
  const m = MOOD[e.mood] || MOOD.meh;
  return Math.max(0, Math.min(100, Math.round(50 * (m.s - 1) / 4 + e.energy * 2 + (10 - e.stress) * 2 + e.social)));
}

export function level(v) {
  if (v >= 85) return ['Royal Ruler of Everything 👑', 'Unstoppable and glowing.'];
  if (v >= 70) return ['Radiant Princess ✨', 'Sparkling like a chandelier.'];
  if (v >= 55) return ['Steady Sparkle 💫', 'Doing just fine, gorgeous.'];
  if (v >= 40) return ['Needs a Boba Break 🧋', 'A little treat will help.'];
  if (v >= 25) return ['Needs Royal Rest 🛁', 'Time to slow down and recharge.'];
  return ['Code Pink: call the Royal Court 💌', 'Please lean on your people today.'];
}

export function inRange(entries, r) {
  const all = entries.slice().sort((a, b) => new Date(a.ts) - new Date(b.ts));
  if (r === 'all') return all;
  const cut = Date.now() - Number(r) * 864e5;
  return all.filter((e) => new Date(e.ts).getTime() >= cut);
}

export function streak(entries) {
  const days = new Set(entries.map((e) => dayKey(new Date(e.ts))));
  let c = 0;
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) { c++; d.setDate(d.getDate() - 1); }
  return c;
}

export function stats(list) {
  const n = list.length;
  const o = {
    n,
    vibe: avg(list.map(vibe)),
    energy: avg(list.map((e) => e.energy)),
    stress: avg(list.map((e) => e.stress)),
    social: avg(list.map((e) => e.social)),
    score: avg(list.map((e) => (MOOD[e.mood] || MOOD.meh).s)),
  };
  o.dist = {};
  MOODS.forEach((m) => (o.dist[m.k] = 0));
  list.forEach((e) => { if (o.dist[e.mood] != null) o.dist[e.mood]++; });
  o.tags = {};
  list.forEach((e) => (e.tags || []).forEach((t) => (o.tags[t] = (o.tags[t] || 0) + 1)));
  o.lowTags = {};
  list.filter((e) => (MOOD[e.mood] || MOOD.meh).s <= 2 || e.stress >= 7)
    .forEach((e) => (e.tags || []).forEach((t) => (o.lowTags[t] = (o.lowTags[t] || 0) + 1)));
  o.high = {};
  list.filter((e) => (MOOD[e.mood] || MOOD.meh).s >= 4)
    .forEach((e) => (e.tags || []).forEach((t) => (o.high[t] = (o.high[t] || 0) + 1)));
  o.care = {};
  CARE.forEach((c) => (o.care[c[1]] = 0));
  list.forEach((e) => (e.care || []).forEach((c) => { if (o.care[c] != null) o.care[c]++; }));
  o.careRate = n ? avg(list.map((e) => (e.care || []).length / CARE.length)) * 100 : 0;
  const w = Array.from({ length: 7 }, () => []);
  list.forEach((e) => w[new Date(e.ts).getDay()].push(vibe(e)));
  o.wd = w.map((a) => (a.length ? avg(a) : null));
  return o;
}

export const topOf = (obj) => Object.entries(obj).sort((x, y) => y[1] - x[1])[0] || null;
export function tagLabel(name) { const t = TAGS.find((x) => x[1] === name); return t ? t[0] + ' ' + name : name; }
export function topMood(o) {
  const a = Object.entries(o.dist).sort((x, y) => y[1] - x[1])[0];
  return a && a[1] > 0 ? MOOD[a[0]] : null;
}

export function insightsList(o, list) {
  const out = [];
  if (!o.n) return out;
  const tm = topMood(o);
  if (tm) out.push(`Your most common mood was <b>${tm.e} ${esc(tm.n)}</b> (${o.dist[tm.k]} of ${o.n} check-ins).`);
  out.push(`Average royal vibe score: <b>${Math.round(o.vibe)}/100</b> — ${esc(level(o.vibe)[0])}`);
  const ls = topOf(o.lowTags);
  if (ls) out.push(`Your top mood-dipper: <b>${esc(tagLabel(ls[0]))}</b>. Plan extra self-care on those days.`);
  const hs = topOf(o.high);
  if (hs) out.push(`Your top mood-booster: <b>${esc(tagLabel(hs[0]))}</b>. Do more of that! 💖`);
  const wdv = o.wd.map((v, i) => [v, i]).filter((x) => x[0] != null);
  if (wdv.length > 1) {
    wdv.sort((a, b) => b[0] - a[0]);
    out.push(`Happiest day: <b>${WD[wdv[0][1]]}</b> · toughest day: <b>${WD[wdv[wdv.length - 1][1]]}</b>.`);
  }
  if (o.stress >= 6.5) out.push(`Stress has been running high (<b>${o.stress.toFixed(1)}/10</b>). Schedule real breaks this week 🫧`);
  else if (o.stress <= 3.5) out.push(`Stress is low (<b>${o.stress.toFixed(1)}/10</b>). Lovely balance 🌷`);
  if (o.energy <= 4) out.push(`Energy averages <b>${o.energy.toFixed(1)}/10</b>. Check sleep, water, and meals 🍱`);
  out.push(`Self-care completion: <b>${Math.round(o.careRate)}%</b> of rituals ${o.careRate >= 60 ? '— queen of self-love! 🧖‍♀️' : '— room to pamper yourself more 🧴'}`);
  if (list.length >= 6) {
    const half = Math.floor(list.length / 2);
    const a = avg(list.slice(0, half).map(vibe));
    const b = avg(list.slice(half).map(vibe));
    if (b - a >= 5) out.push('Trend alert: your vibe is <b>going up</b> 📈 keep it going!');
    else if (a - b >= 5) out.push('Trend alert: your vibe has been <b>dipping lately</b> 📉 be extra gentle with yourself.');
  }
  return out;
}
