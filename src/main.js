// fonts are bundled with the app (not fetched from Google) so it looks the same offline
import '@fontsource/fredoka/latin-400.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import '@fontsource/pacifico/latin-400.css';
import '@fontsource/dancing-script/latin-600.css';
import '@fontsource/dancing-script/latin-700.css';
import './style.css';
import {
  MOODS, MOOD, TAGS, CARE, COMPLIMENTS, SAMPLE_NOTES, PRINCESS_NAME, PICK_MSG, THEME_COLORS,
} from './config.js';
import {
  $, $$, esc, dayKey, localInput, fmtDate, fmtTime, WD, pick, avg, download, buzz, clamp,
} from './utils.js';
import {
  vibe, level, inRange, streak, stats, insightsList,
} from './analytics.js';
import { reportHTML, csv } from './report.js';
import {
  toneFor, localNote, fetchNote, cachedNote, saveNote, wasOpened, markOpened,
} from './dailynote.js';
import { cloud, auth, store, cleanEntry } from './store.js';
import { registerSW } from 'virtual:pwa-register';

const state = { uid: null, diaryLimit: 60 };
const E = () => store.entries(); // the diary lives in the offline store (on this phone), always available
const THEME_KEY = 'scs_princess_theme';
const TABS = ['checkin', 'dash', 'diary', 'report'];
let selMood = null;
const selTags = new Set();
const selCare = new Set();
// Captured at load, before supabase-js strips the hash: opened from a "reset password" email?
let recovering = /type=recovery/.test(window.location.hash);
let activeTab = 'checkin';
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ============================== helpers ============================== */
function toast(t) {
  const el = $('#toast');
  el.textContent = t;
  el.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('on'), 2800);
}
const oops = (what, e) => { console.error(what, e); toast(`Couldn't ${what} 🥺 check your connection and try again`); };

function confetti(n) {
  const em = ['💖', '✨', '👑', '🌸', '🎀', '💅', '🦄', '🍓', '💎', '⭐'];
  for (let i = 0; i < (n || 40); i++) {
    const s = document.createElement('span');
    s.className = 'confetti';
    s.textContent = pick(em);
    s.style.left = Math.random() * 100 + 'vw';
    s.style.fontSize = (16 + Math.random() * 22) + 'px';
    s.style.animationDuration = (2 + Math.random() * 2.5) + 's';
    s.style.animationDelay = Math.random() * 0.6 + 's';
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 5500);
  }
}

// sparkles on taps of buttons only (not while scrolling)
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('button')) return;
  for (let i = 0; i < 5; i++) {
    const s = document.createElement('span');
    s.className = 'spark';
    s.textContent = pick(['✨', '💖', '⭐', '🌸']);
    s.style.left = e.clientX + 'px';
    s.style.top = e.clientY + 'px';
    s.style.setProperty('--dx', (Math.random() * 80 - 40) + 'px');
    s.style.setProperty('--dy', (Math.random() * 80 - 50) + 'px');
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 900);
  }
});

/* ============================== theme ============================== */
function applyTheme(t) {
  if (!THEME_COLORS[t]) t = 'pink';
  document.body.dataset.theme = t;
  $$('.dot').forEach((d) => d.classList.toggle('on', d.dataset.t === t));
  $('#themeColor').setAttribute('content', THEME_COLORS[t]);
  try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* ignore */ }
}
function savedTheme() { try { return localStorage.getItem(THEME_KEY) || 'pink'; } catch (e) { return 'pink'; } }

/* ============================== static UI ============================== */
function buildFloaties() {
  const f = $('#floaties');
  const em = ['💖', '✨', '👑', '🌸', '🎀', '💅', '🦄', '🍓', '💎', '🫧', '🌷', '⭐'];
  for (let i = 0; i < 22; i++) {
    const s = document.createElement('span');
    s.textContent = em[i % em.length];
    s.style.left = Math.random() * 100 + '%';
    s.style.fontSize = (14 + Math.random() * 26) + 'px';
    s.style.animationDuration = (14 + Math.random() * 18) + 's';
    s.style.animationDelay = (-Math.random() * 25) + 's';
    f.appendChild(s);
  }
}

function buildForm() {
  $('#moods').innerHTML = MOODS.map((m, i) => `<button type="button" class="mood" data-k="${m.k}" aria-pressed="false" style="--c:${m.c};--i:${i}"><span class="e">${m.e}</span><span class="n">${esc(m.n)}</span></button>`).join('');
  $('#tags').innerHTML = TAGS.map((t, i) => `<button type="button" class="chip" data-v="${esc(t[1])}" aria-pressed="false" style="--i:${i}">${t[0]} ${esc(t[1])}</button>`).join('');
  $('#care').innerHTML = CARE.map((t, i) => `<button type="button" class="chip care" data-v="${esc(t[1])}" aria-pressed="false" style="--i:${i}">${t[0]} ${esc(t[1])}</button>`).join('');
  $('#fMood').innerHTML = '<option value="">All moods 💞</option>' + MOODS.map((m) => `<option value="${m.k}">${m.e} ${esc(m.n)}</option>`).join('');
  $('#moodmsg').textContent = PICK_MSG;
  $('#when').value = localInput(new Date());
  syncSliders(true);
  buildProgress();
  goStep(0, { instant: true });
}

function resetForm() {
  selMood = null;
  selTags.clear();
  selCare.clear();
  $$('.mood,.chip').forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); });
  $('#moodmsg').textContent = PICK_MSG;
  $('#energy').value = 6; $('#stress').value = 4; $('#social').value = 6;
  ['energy', 'stress', 'social'].forEach((id) => { $('#v-' + id).textContent = $('#' + id).value; });
  $('#note').value = '';
  $('#nc').textContent = '0';
  $('#when').value = localInput(new Date());
  whenTouched = false;
  $('#whenBox').hidden = true;
  $('#whenBtn').textContent = 'change';
  $('#whenBtn').setAttribute('aria-expanded', 'false');
  $('#whenTxt').textContent = '🕒 Right now';
  $('#flowMood').textContent = '👑';
  $('#ambient').style.removeProperty('--mc');
  $('#carePop').textContent = '';
  resumeStep = 0;
  syncSliders(true);
  goStep(0, { instant: true });
}

function greet() {
  const h = new Date().getHours();
  const hello = h < 5 ? 'Still up, ' : h < 12 ? 'Good morning, ' : h < 18 ? 'Good afternoon, ' : 'Good evening, ';
  const icon = h >= 5 && h < 12 ? '☀️' : h >= 12 && h < 18 ? '🌤️' : '🌙';
  $('#greeting').textContent = hello + PRINCESS_NAME + ' ' + icon;
  const n = PRINCESS_NAME.toLowerCase();
  $('#heroSub').textContent = `~ how's ${n}${n.slice(-1).repeat(4)} feeling today? ~`;
}

// only touch the DOM when something changed, so background syncs never replay entrance animations
function setHTML(el, html) { if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; } }

// date, streak and today's earlier check-ins, right under the greeting
function renderHero() {
  const now = new Date();
  $('#heroDate').textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const all = E();
  const key = dayKey(now);
  const today = all.filter((e) => dayKey(new Date(e.ts)) === key).sort((a, b) => new Date(a.ts) - new Date(b.ts));
  const st = streak(all);
  const chips = [];
  if (st > 0) chips.push(`<span class="hchip">🔥 ${st}-day streak</span>`);
  if (today.length) {
    today.slice(-4).forEach((e) => {
      const m = MOOD[e.mood] || MOOD.meh;
      chips.push(`<span class="hchip soft" title="${esc(m.n)}">${m.e} ${esc(fmtTime(e.ts))}</span>`);
    });
  } else {
    chips.push('<span class="hchip soft">🌱 no check-in yet today</span>');
  }
  if (!formPristine()) chips.unshift('<span class="hchip draft">✍️ check-in in progress</span>');
  setHTML($('#heroChips'), chips.join(''));
  $('#startTxt').textContent = formPristine() ? (today.length ? 'Check in again ✨' : 'Start my check-in ✨') : 'Continue my check-in ✨';
  $('#startSub').textContent = formPristine() ? '6 tiny steps · about a minute' : 'pick up right where you left off';

  // the last 7 days as little mood bubbles
  let wk = '';
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = dayKey(d);
    const l = all.filter((e) => dayKey(new Date(e.ts)) === k).sort((a, b) => new Date(a.ts) - new Date(b.ts));
    const m = l.length ? (MOOD[l[l.length - 1].mood] || MOOD.meh) : null;
    wk += `<div class="wd${i === 0 ? ' today' : ''}" style="--i:${6 - i}"><div class="b${m ? ' has' : ''}"${m ? ` style="background:${m.c}2b" title="${esc(m.n)}"` : ''}>${m ? m.e : '<i>·</i>'}</div><span>${i === 0 ? 'today' : WD[d.getDay()]}</span></div>`;
  }
  setHTML($('#weekStrip'), wk);
}

/* ============================== the sealed note ============================== */
let note = null;
let noteDay = '';
const letterEl = () => $('#letter');

function renderNote(n) {
  const words = n.text.replace(/'/g, '\u2019').split(/\s+/).filter(Boolean);
  words[0] = '\u201C' + words[0];
  words[words.length - 1] += '\u201D';
  $('#noteText').innerHTML = words.map((w, i) => `<span class="w" style="--i:${i}">${esc(w)}</span>`).join(' ');
  $('#noteBy').textContent = '\u2014 ' + n.author;
  $('#noteCard').style.setProperty('--n', words.length);
}

function openLetter(instant) {
  const L = letterEl();
  if (L.dataset.state !== 'sealed') return;
  const btn = $('#sealBtn');
  if (instant) {
    L.classList.add('static', 'settled');
    L.dataset.state = 'open';
    btn.hidden = true;
    $('#notePaper').inert = false;
    return;
  }
  markOpened();
  btn.setAttribute('aria-expanded', 'true');
  btn.disabled = true;
  buzz([15, 30, 15]);
  confetti(18);
  L.dataset.state = 'opening';
  setTimeout(() => {
    L.dataset.state = 'open';
    $('#notePaper').inert = false;
    try { $('#paper').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }, 440);
  setTimeout(() => { L.classList.add('settled'); btn.hidden = true; }, 1300);
}

// Today's note: same all day, new at midnight. Shown instantly from the phone's copy or the local bank,
// then swapped for a fresh one from the web if that arrives before she opens the seal.
function initNote() {
  const now = new Date();
  const day = dayKey(now);
  const L = letterEl();
  if (noteDay !== day) {
    noteDay = day;
    L.dataset.state = 'sealed';
    L.classList.remove('settled', 'static');
    const b = $('#sealBtn');
    b.hidden = false; b.disabled = false; b.setAttribute('aria-expanded', 'false');
    $('#notePaper').inert = true;
  }
  const opened = wasOpened(now);
  const tone = toneFor(E(), now);
  let n = cachedNote(now);
  if (!n || (n.t !== tone && !opened)) { n = localNote(tone, now); saveNote(n); }
  note = n;
  renderNote(n);
  if (opened) openLetter(true);
  else if (n.src !== 'web' && navigator.onLine !== false) {
    fetchNote(tone, now).then((w) => {
      if (!w || noteDay !== day || wasOpened() || letterEl().dataset.state !== 'sealed') return;
      note = w; saveNote(w); renderNote(w);
    });
  }
}

// small form helpers
let whenTouched = false;
const FACES = {
  energy: ['🪫', '🪫', '😪', '😪', '🙂', '🙂', '😊', '⚡', '⚡', '🔋', '🚀'],
  stress: ['🧘‍♀️', '🧘‍♀️', '😌', '😌', '🙂', '😬', '😬', '😰', '😵‍💫', '🤯', '🌋'],
  social: ['🛌', '🛌', '🐚', '🐚', '🧸', '🙂', '😊', '🦋', '🦋', '🎉', '🎤'],
};
function syncSliders(quiet) {
  ['energy', 'stress', 'social'].forEach((id) => {
    const el = $('#' + id);
    el.style.setProperty('--k', String(el.value / 10));
    $('#v-' + id).textContent = el.value;
    const face = $('#face-' + id);
    const next = FACES[id][+el.value];
    if (face.textContent !== next) {
      face.textContent = next;
      if (!quiet) { face.classList.remove('pulse'); void face.offsetWidth; face.classList.add('pulse'); }
    }
  });
  liveVibe(quiet);
}
function liveVibe(quiet) {
  const v = vibe({ mood: selMood || 'meh', energy: +$('#energy').value, stress: +$('#stress').value, social: +$('#social').value });
  $('#liveVibe').textContent = v;
  $('#liveLevel').textContent = level(v)[0];
  $('#liveArc').style.strokeDashoffset = (213.6 * (1 - v / 100)).toFixed(1);
}

// little one-shot animations that never fight with the CSS ones
function bounce(el, from = 0.86) {
  if (reduced || !el || !el.animate) return;
  el.animate([{ transform: `scale(${from})` }, { transform: 'scale(1.1)', offset: 0.55 }, { transform: 'scale(1)' }], { duration: 450, easing: 'cubic-bezier(.34,1.56,.64,1)' });
}
function swapIn(el) {
  if (reduced || !el || !el.animate) return;
  el.animate([{ opacity: 0, transform: 'translateY(8px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.22,1,.36,1)' });
}
// numbers that count up instead of just appearing
function countUp(el, to, { dec = 0, ms = 1100, suffix = '' } = {}) {
  if (!el) return;
  to = Number(to);
  if (reduced || !Number.isFinite(to)) { el.textContent = (Number.isFinite(to) ? to.toFixed(dec) : el.textContent) + suffix; return; }
  const t0 = performance.now();
  const tick = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - k, 4);
    el.textContent = (to * e).toFixed(dec) + suffix;
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ============================== the multi-step check-in ============================== */
// 0 welcome · 1 mood · 2 meters · 3 factors · 4 self-care · 5 diary · 6 review
const STEPS = [null, 'Mood', 'Royal Meters', 'What\u2019s affecting you', 'Self-care', 'Dear Diary', 'Review'];
let step = 0;
let resumeStep = 0;
let stepBusy = false;
const stepEl = (n) => document.querySelector(`.step[data-step="${n}"]`);

function buildProgress() {
  $('#prog').innerHTML = STEPS.slice(1).map(() => '<i></i>').join('');
}

function syncView() {
  document.body.dataset.view = activeTab !== 'checkin' ? 'other' : step === 0 ? 'landing' : 'flow';
}

function syncNav() {
  const inFlow = step > 0;
  $('#flowbar').hidden = !inFlow;
  $('#stepLabel').hidden = !inFlow;
  $('#flownav').hidden = !inFlow;
  if (!inFlow) return;
  const last = step === STEPS.length - 1;
  $('#save').hidden = !last;
  $('#nextBtn').hidden = last;
  $('#backBtn').textContent = step === 1 ? '← Home' : '← Back';
  const nb = $('#nextBtn');
  const labels = {
    1: selMood ? 'Next →' : 'Pick a mood 💕',
    2: 'Next →',
    3: selTags.size ? 'Next →' : 'Skip →',
    4: selCare.size ? 'Next →' : 'Skip →',
    5: $('#note').value.trim() ? 'Review ✨' : 'Skip to review →',
  };
  nb.textContent = labels[step] || 'Next →';
  const idle = step === 1 && !selMood;
  nb.classList.toggle('idle', idle);
  nb.classList.toggle('go', !idle && step === 1);
  $$('#prog i').forEach((seg, i) => { seg.classList.toggle('done', i + 1 < step); seg.classList.toggle('cur', i + 1 === step); });
  $('#prog').setAttribute('aria-valuenow', String(step));
  $('#stepLabel').textContent = `Step ${step} of ${STEPS.length - 1} · ${STEPS[step]}`;
}

function onStepShown() {
  $('#wizard').dataset.step = String(step);
  syncView();
  syncNav();
  if (step === 2) liveVibe();
  if (step === 6) renderSummary();
  window.scrollTo({ top: 0, behavior: 'auto' });
  const h = stepEl(step) && stepEl(step).querySelector('.stepttl');
  if (h) { try { h.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  if (step === 0) renderHero();
}

function goStep(n, { instant = false } = {}) {
  n = clamp(n, 0, STEPS.length - 1);
  if (stepBusy) return;
  if (n === step && !instant) return;
  const dir = n >= step ? 'fwd' : 'back';
  const from = stepEl(step);
  const to = stepEl(n);
  const swap = () => {
    $$('.step').forEach((el) => {
      el.hidden = el !== to;
      el.classList.remove('in-fwd', 'in-back', 'out-fwd', 'out-back');
    });
    if (!instant) to.classList.add('in-' + dir);
    step = n;
    stepBusy = false;
    onStepShown();
  };
  if (instant || reduced || !from || from.hidden) { swap(); return; }
  stepBusy = true;
  from.classList.add('out-' + dir);
  setTimeout(swap, 190);
}

function nextStep() {
  if (step === 1 && !selMood) {
    toast('Pick a mood first, princess 💕');
    buzz(30);
    const nb = $('#nextBtn');
    nb.classList.remove('shake'); void nb.offsetWidth; nb.classList.add('shake');
    return;
  }
  buzz(8);
  goStep(step + 1);
}

function startFlow() {
  buzz(12);
  goStep(!formPristine() && resumeStep > 0 ? resumeStep : 1);
}
function closeFlow() {
  resumeStep = step;
  goStep(0);
}

// everything she picked, on one page, with a way back to change each part
function renderSummary() {
  if (!selMood) { goStep(1, { instant: true }); return; }
  const m = MOOD[selMood];
  const en = +$('#energy').value, st = +$('#stress').value, so = +$('#social').value;
  const v = vibe({ mood: selMood, energy: en, stress: st, social: so });
  const lv = level(v);
  const when = whenTouched ? new Date($('#when').value) : new Date();
  const note = $('#note').value.trim();
  const chips = (arr, cls) => (arr.length ? `<div class="sumchips">${arr.map((t) => `<span class="tag${cls}">${esc(t)}</span>`).join('')}</div>` : '<div class="sumnone">nothing picked</div>');
  const meter = (label, val, i) => `<div class="mrow"><span class="mn">${label}</span><span class="mt"><span class="mf" style="--w:${val * 10}%;--i:${i}"></span></span><span class="mv">${val}</span></div>`;
  $('#summary').innerHTML = `
    <div class="sumhero" style="--mc:${m.c}">
      <div class="sumem">${m.e}</div>
      <div class="sumtxt"><div class="sumname">${esc(m.n)}</div><div class="sumlvl">${esc(lv[0])}</div><button type="button" class="edit" data-go="1" style="margin-top:8px">change mood</button></div>
      <div class="sumscore"><svg viewBox="0 0 80 80" aria-hidden="true"><defs><linearGradient id="sg" x1="0" x2="1"><stop offset="0" stop-color="#ff7cbc"/><stop offset="1" stop-color="#b98cff"/></linearGradient></defs><circle cx="40" cy="40" r="34" fill="none" stroke="#fff" stroke-width="9"/><circle class="arc" cx="40" cy="40" r="34" fill="none" stroke="url(#sg)" stroke-width="9" stroke-linecap="round" stroke-dasharray="213.6" stroke-dashoffset="${(213.6 * (1 - v / 100)).toFixed(1)}" transform="rotate(-90 40 40)"/></svg><b id="sumV">0</b></div>
    </div>
    <div class="sumcard" style="--i:0"><div class="sh"><span>🎚️ Royal Meters</span><button type="button" class="edit" data-go="2">edit</button></div>
      ${meter('⚡ Energy', en, 0)}${meter('😵‍💫 Stress', st, 1)}${meter('🦋 Social', so, 2)}</div>
    <div class="sumcard" style="--i:1"><div class="sh"><span>🎀 Affecting your mood</span><button type="button" class="edit" data-go="3">edit</button></div>${chips([...selTags], '')}</div>
    <div class="sumcard" style="--i:2"><div class="sh"><span>🧴 Self-care</span><button type="button" class="edit" data-go="4">edit</button></div>${chips([...selCare], ' g')}</div>
    <div class="sumcard" style="--i:3"><div class="sh"><span>📔 Dear Diary</span><button type="button" class="edit" data-go="5">edit</button></div>${note ? `<div class="sumnote">“${esc(note)}”</div>` : '<div class="sumnone">no note today</div>'}</div>
    <div class="sumwhen">🕒 ${esc(whenTouched && !isNaN(when) ? when.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Right now')}</div>`;
  countUp($('#sumV'), v, { ms: 1400 });
}

/* ============================== save ============================== */
async function saveEntry() {
  if (!selMood) {
    toast('Pick a mood first, princess 💕');
    buzz(30);
    goStep(1);
    return;
  }
  // "Right now" means the moment she taps Save, not whenever the page was opened
  const when = whenTouched ? new Date($('#when').value) : new Date();
  const row = cleanEntry({
    ts: isNaN(when) ? new Date() : when,
    mood: selMood,
    energy: +$('#energy').value,
    stress: +$('#stress').value,
    social: +$('#social').value,
    tags: [...selTags],
    care: [...selCare],
    note: $('#note').value.trim(),
  });
  const saved = store.add(row); // saved on the phone instantly; uploads whenever there's a connection
  const v = vibe(saved);
  const m = MOOD[saved.mood];
  const lv = level(v);
  const st = streak(E());
  $('#modal').innerHTML = `<div class="bigem">${m.e}</div><h3>Royal Mood Saved!</h3><div class="vs">${v}/100</div><p><b>${esc(lv[0])}</b><br><small>${esc(lv[1])}</small></p><div class="adv">${esc(pick(m.adv))}</div><p>${esc(pick(COMPLIMENTS))}</p><p><small>🔥 Streak: ${st} day${st === 1 ? '' : 's'}</small></p><button class="btn" id="closeM">Thank you 💕</button>`;
  $('#overlay').classList.add('on');
  $('#closeM').onclick = () => $('#overlay').classList.remove('on');
  countUp($('#modal .vs'), v, { suffix: '/100', ms: 1200 });
  buzz(m.s >= 4 ? [20, 40, 20] : 20);
  confetti(m.s >= 4 ? 60 : 30);
  resetForm();
  renderAll();
  tryApplyUpdate();
}

/* ============================== dashboard ============================== */
function renderStats() {
  const all = E();
  const list = inRange(all, $('#range').value);
  const o = stats(list);
  $('#stats').innerHTML = [
    ['🔥', streak(all), 'day streak'], ['📝', all.length, 'total check-ins'],
    ['💫', o.n ? Math.round(o.vibe) : '–', 'avg vibe'], ['⚡', o.n ? o.energy.toFixed(1) : '–', 'avg energy'],
  ].map((s, i) => `<div class="stat" style="--ci:${i}"><div class="big">${s[0]} <span class="cu"${/^\d+(\.\d+)?$/.test(String(s[1])) ? ` data-to="${s[1]}" data-dec="${String(s[1]).split('.')[1] ? 1 : 0}"` : ''}>${s[1]}</span></div><div class="tt">${s[2]}</div></div>`).join('');
  $$('#stats .cu[data-to]').forEach((el) => countUp(el, el.dataset.to, { dec: +el.dataset.dec, ms: 1000 }));

  const todayKey = dayKey(new Date());
  const today = all.filter((e) => dayKey(new Date(e.ts)) === todayKey).sort((a, b) => new Date(a.ts) - new Date(b.ts));
  const last = today[today.length - 1];
  if (last) {
    const v = vibe(last), m = MOOD[last.mood], lv = level(v);
    $('#gaugeCard').innerHTML = `<h2>🌡️ Today's Royal Mood Meter</h2><svg viewBox="0 0 200 125" role="img" aria-label="Today's vibe ${v} out of 100"><defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0" stop-color="#ffb3d6"/><stop offset=".5" stop-color="#ff5fa8"/><stop offset="1" stop-color="#b98cff"/></linearGradient></defs><path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round"/><path class="arc" d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="url(#gg)" stroke-width="18" stroke-linecap="round" stroke-dasharray="251.3" stroke-dashoffset="${(251.3 * (1 - v / 100)).toFixed(1)}"/><text x="100" y="78" text-anchor="middle" font-size="38">${m.e}</text><text x="100" y="106" text-anchor="middle" font-size="22" font-weight="700" fill="#d92f84" font-family="Fredoka">${v}</text></svg><div class="gtitle">${esc(lv[0])}</div><div class="gsub">${esc(lv[1])} · ${today.length} check-in${today.length > 1 ? 's' : ''} today</div>`;
  } else {
    $('#gaugeCard').innerHTML = '<h2>🌡️ Today\'s Royal Mood Meter</h2><div class="empty">No check-in yet today 🥺<br>Tap "Check-in" to log your mood!</div>';
  }

  const ins = insightsList(o, list);
  $('#insights').innerHTML = ins.length ? ins.map((t, i) => `<div class="insight" style="--i:${i}">${t}</div>`).join('') : '<div class="empty">Log a few moods and the insights will appear ✨</div>';

  const maxd = Math.max(1, ...Object.values(o.dist));
  $('#mix').innerHTML = o.n ? MOODS.map((m, i) => `<div class="b"><span class="nm">${m.e} ${esc(m.n)}</span><span class="tr"><span class="fl" style="display:block;--w:${o.dist[m.k] / maxd * 100}%;--i:${i};background:${m.c}"></span></span><span class="ct">${o.dist[m.k]}</span></div>`).join('') : '<div class="empty">Nothing here yet 🌸</div>';

  const cmax = Math.max(1, o.n);
  $('#carebars').innerHTML = o.n ? CARE.map((c, i) => `<div class="b"><span class="nm">${c[0]} ${esc(c[1])}</span><span class="tr"><span class="fl" style="display:block;--w:${o.care[c[1]] / cmax * 100}%;--i:${i};background:linear-gradient(90deg,#7fe5c4,#5fc9ff)"></span></span><span class="ct">${o.care[c[1]]}</span></div>`).join('') : '<div class="empty">Nothing here yet 🧴</div>';

  if (o.n) {
    const W = 320, H = 150, bw = 30, gap = (W - 7 * bw) / 8;
    let s = `<svg viewBox="0 0 ${W} ${H + 30}" style="width:100%" role="img" aria-label="Average vibe by weekday"><defs><linearGradient id="wg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ff5fa8"/><stop offset="1" stop-color="#c98bff"/></linearGradient></defs>`;
    o.wd.forEach((v, i) => {
      const x = gap + i * (bw + gap);
      const h = v == null ? 4 : Math.max(6, v / 100 * H);
      const y = H - h;
      s += `<rect class="wbar" style="--i:${i}" x="${x}" y="${y}" width="${bw}" height="${h}" rx="10" fill="${v == null ? '#fff' : 'url(#wg)'}"/>`;
      if (v != null) s += `<text x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" font-size="11" fill="#d92f84" font-weight="600" font-family="Fredoka">${Math.round(v)}</text>`;
      s += `<text x="${x + bw / 2}" y="${H + 18}" text-anchor="middle" font-size="12" fill="#a46d97" font-family="Fredoka">${WD[i]}</text>`;
    });
    $('#weekday').innerHTML = s + '</svg>';
  } else {
    $('#weekday').innerHTML = '<div class="empty">Nothing here yet 🗓️</div>';
  }
  trend();
  calendar();
}

function trend() {
  const el = $('#trend');
  const days = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
  const pts = days.map((d) => {
    const k = dayKey(d);
    const l = E().filter((e) => dayKey(new Date(e.ts)) === k);
    return { d, v: l.length ? avg(l.map(vibe)) : null };
  });
  if (!pts.some((p) => p.v != null)) { el.innerHTML = '<div class="empty">Your vibe line will appear after your first check-in 📈</div>'; return; }
  // size the chart to the real width so text stays readable on phones
  const W = Math.max(290, Math.min(640, el.clientWidth || 640));
  const H = 210, L = 30, R = 12, T = 22, B = 34;
  const x = (i) => L + i * (W - L - R) / 13;
  const y = (v) => T + (1 - v / 100) * (H - T - B);
  const every = W < 420 ? 3 : 2;
  let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="Vibe trend, last 14 days"><defs><linearGradient id="tg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ff5fa8" stop-opacity=".45"/><stop offset="1" stop-color="#ff5fa8" stop-opacity="0"/></linearGradient></defs>`;
  [0, 25, 50, 75, 100].forEach((g) => {
    s += `<line x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}" stroke="#fff" stroke-width="2"/><text x="${L - 6}" y="${y(g) + 4}" text-anchor="end" font-size="11" fill="#a46d97" font-family="Fredoka">${g}</text>`;
  });
  const valid = pts.map((p, i) => (p.v == null ? null : [x(i), y(p.v)])).filter(Boolean);
  if (valid.length > 1) {
    const path = valid.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    s += `<path class="trendarea" d="${path} L${valid[valid.length - 1][0]} ${H - B} L${valid[0][0]} ${H - B} Z" fill="url(#tg)"/><path class="trendline" pathLength="1" d="${path}" fill="none" stroke="#ff5fa8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  pts.forEach((p, i) => {
    if ((i % every === 0 && 13 - i >= every) || i === 13) s += `<text x="${x(i)}" y="${H - 12}" text-anchor="middle" font-size="11" fill="#a46d97" font-family="Fredoka">${p.d.getMonth() + 1}/${p.d.getDate()}</text>`;
    if (p.v != null) {
      const k = dayKey(p.d);
      const l = E().filter((e) => dayKey(new Date(e.ts)) === k).sort((a, b) => new Date(a.ts) - new Date(b.ts));
      const m = MOOD[l[l.length - 1].mood];
      s += `<g class="trendpt" style="--i:${i}"><circle cx="${x(i)}" cy="${y(p.v)}" r="6" fill="#fff" stroke="#ff5fa8" stroke-width="3"/><text x="${x(i)}" y="${y(p.v) - 12}" text-anchor="middle" font-size="15">${m.e}</text></g>`;
    }
  });
  el.innerHTML = s + '</svg>';
}

function calendar() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (34 + end.getDay()));
  let h = WD.map((w) => `<div class="h">${w[0]}</div>`).join('');
  const d = new Date(start);
  for (let i = 0; i < 42 && d <= end; i++, d.setDate(d.getDate() + 1)) {
    const si = `--i:${i}`;
    const k = dayKey(d);
    const l = E().filter((e) => dayKey(new Date(e.ts)) === k).sort((a, b) => new Date(a.ts) - new Date(b.ts));
    const isT = k === dayKey(new Date());
    if (l.length) {
      const m = MOOD[l[l.length - 1].mood];
      h += `<div class="c${isT ? ' today' : ''}" style="${si};background:${m.c}33" title="${esc(k + ' · ' + m.n)}"><small>${d.getDate()}</small>${m.e}</div>`;
    } else {
      h += `<div class="c${isT ? ' today' : ''}" style="${si}"><small>${d.getDate()}</small><span style="opacity:.25">·</span></div>`;
    }
  }
  $('#cal').innerHTML = h;
}

/* ============================== diary ============================== */
function renderDiary() {
  const fm = $('#fMood').value;
  const ft = $('#fText').value.trim().toLowerCase();
  let list = E().slice().sort((a, b) => new Date(b.ts) - new Date(a.ts));
  if (fm) list = list.filter((e) => e.mood === fm);
  if (ft) list = list.filter((e) => ((e.note || '') + ' ' + (e.tags || []).join(' ')).toLowerCase().includes(ft));
  $('#moreDiary').hidden = list.length <= state.diaryLimit;
  if (!list.length) {
    $('#diaryList').innerHTML = '<div class="card"><div class="empty">' + (E().length ? 'No entries match your search 🔍' : 'Your diary is waiting for its first page 📖💕') + '</div></div>';
    return;
  }
  const pend = store.pendingIds();
  $('#diaryList').innerHTML = list.slice(0, state.diaryLimit).map((e, idx) => {
    const m = MOOD[e.mood] || MOOD.meh;
    const v = vibe(e);
    const waiting = pend.has(e.id) ? '<span class="tag w">⏳ waiting to sync</span>' : '';
    return `<div class="entry" style="border-left:8px solid ${m.c};--i:${Math.min(idx, 12)}"><div class="em">${m.e}</div><div class="mid"><div class="ttl">${esc(m.n)}</div><div class="when">${esc(fmtDate(e.ts))} · ${esc(fmtTime(e.ts))} · ⚡${e.energy} · 😵‍💫${e.stress} · 🦋${e.social}</div>${e.note ? `<div class="note">“${esc(e.note)}”</div>` : ''}<div class="meta">${waiting}${(e.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}${(e.care || []).map((t) => `<span class="tag g">${esc(t)}</span>`).join('')}</div></div><div class="side"><div class="score">${v}<small>vibe</small></div><button class="del" data-id="${esc(e.id)}" aria-label="Delete entry">🗑️</button></div></div>`;
  }).join('');
}

/* ============================== reports ============================== */
const rangeVal = () => $('#rRange').value;
const stamp = () => dayKey(new Date());
function refreshPreview() { $('#preview').srcdoc = reportHTML(E(), rangeVal(), PRINCESS_NAME); }

async function shareReport() {
  const html = reportHTML(E(), rangeVal(), PRINCESS_NAME);
  const file = new File([html], `princess-mood-report-${stamp()}.html`, { type: 'text/html' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Princess Mood Report 👑' });
    } else {
      download(file.name, html, 'text/html');
      toast('Report downloaded 👑');
    }
  } catch (e) {
    if (e && e.name !== 'AbortError') toast('Sharing didn\'t work, try Download instead 🥺');
  }
}

/* ============================== sample data / backup ============================== */
function sampleRows() {
  const w = [['slay', 3], ['glow', 3], ['happy', 5], ['chill', 4], ['meh', 3], ['sleepy', 3], ['stressed', 4], ['sad', 2], ['angry', 1], ['crisis', 1]];
  const bag = [];
  w.forEach(([k, n]) => { for (let i = 0; i < n; i++) bag.push(k); });
  const out = [];
  const rnd = (base) => Math.max(0, Math.min(10, Math.round(base + Math.random() * 3 - 1.5)));
  for (let i = 20; i >= 0; i--) {
    const per = 1 + (Math.random() < 0.35 ? 1 : 0);
    for (let j = 0; j < per; j++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(9 + Math.floor(Math.random() * 11), Math.floor(Math.random() * 60), 0, 0);
      if (d > new Date()) continue;
      const k = pick(bag), m = MOOD[k], hi = m.s >= 4, mid = m.s === 3;
      out.push(cleanEntry({
        ts: d, mood: k,
        energy: rnd(hi ? 7 : mid ? 5 : 3), stress: rnd(hi ? 2 : mid ? 4 : 7), social: rnd(hi ? 7 : mid ? 5 : 3),
        tags: TAGS.map((t) => t[1]).sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 3)),
        care: CARE.map((c) => c[1]).sort(() => Math.random() - 0.5).slice(0, Math.floor(Math.random() * (hi ? 6 : 4))),
        note: Math.random() < 0.6 ? pick(SAMPLE_NOTES) : '',
        is_sample: true,
      }));
    }
  }
  return out;
}

function addSample() {
  store.addMany(sampleRows());
  renderAll();
  toast('Sample data added 🎀 check the Dashboard!');
  confetti(25);
}
function removeSample() {
  if (!E().some((e) => e.is_sample)) { toast('No sample data to remove ✨'); return; }
  store.removeSamples();
  renderAll();
  toast('Sample data removed 🧽');
}
// Pretty in-app confirm popup (replaces the browser's plain "This site says…" box)
let pendingConfirm = null;
function askConfirm({ emoji = '💭', title, text = '', yes = 'Yes', no = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    if (pendingConfirm) pendingConfirm(false);
    const done = (v) => { pendingConfirm = null; $('#overlay').classList.remove('on'); resolve(v); };
    pendingConfirm = done;
    $('#modal').innerHTML = `<div class="bigem">${emoji}</div><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}<div class="btnrow stack" style="margin-top:14px"><button class="btn${danger ? ' danger' : ''}" id="cfYes">${esc(yes)}</button><button class="btn alt" id="cfNo">${esc(no)}</button></div>`;
    $('#overlay').classList.add('on');
    $('#cfYes').onclick = () => done(true);
    $('#cfNo').onclick = () => done(false);
    setTimeout(() => { try { $('#cfNo').focus(); } catch (e) { /* ignore */ } }, 50);
  });
}

async function clearAll() {
  if (!(await askConfirm({ emoji: '🗑️', title: 'Delete everything?', text: 'All diary entries will be removed. This cannot be undone.', yes: 'Yes, delete all', no: 'Keep my diary', danger: true }))) return;
  store.removeAll();
  renderAll();
  toast('All clean ✨');
}
async function deleteEntry(id) {
  if (!(await askConfirm({ emoji: '🥺', title: 'Delete this entry?', text: 'This diary entry will be removed.', yes: 'Delete it', no: 'Keep it', danger: true }))) return;
  store.remove(id);
  renderAll();
  toast('Entry deleted 🗑️');
}

function importFile(file) {
  const r = new FileReader();
  r.onload = () => {
    let rows;
    try {
      const s = JSON.parse(r.result);
      if (!s || !Array.isArray(s.entries)) throw new Error('bad file');
      rows = s.entries.map(cleanEntry).filter(Boolean);
    } catch (err) { toast('That file doesn\'t look like a backup 🥺'); return; }
    if (!rows.length) { toast('No usable entries found in that file 🥺'); return; }
    const added = store.addMany(rows);
    renderAll();
    toast(`Restored ${added.length} entr${added.length === 1 ? 'y' : 'ies'} 💕`);
  };
  r.readAsText(file);
}

/* ============================== tabs ============================== */
function renderAll() { renderStats(); renderDiary(); renderHero(); refreshPreview(); }

function setTab(t, scroll = true) {
  if (!TABS.includes(t)) t = 'checkin';
  activeTab = t;
  $$('#nav button').forEach((b) => { b.classList.toggle('on', b.dataset.tab === t); b.setAttribute('aria-current', b.dataset.tab === t ? 'page' : 'false'); });
  $$('section.tab').forEach((s) => s.classList.toggle('on', s.id === 'tab-' + t));
  syncView();
  if (t === 'dash') renderStats();
  if (t === 'report') refreshPreview();
  if (t === 'diary') { const dl = $('#diaryList'); dl.classList.add('enter'); setTimeout(() => dl.classList.remove('enter'), 1200); }
  $$('#tab-' + t + ' .card').forEach((c, i) => c.style.setProperty('--ci', String(Math.min(i, 8))));
  try { history.replaceState(null, '', '#' + t); } catch (e) { /* ignore */ }
  if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============================== auth UI ============================== */
let authMode = 'signin';
const AUTH_COPY = {
  signin: { title: 'Welcome back', sub: 'log in to your royal diary', btn: 'Log in 💖', pass: true, pw: 'current-password', switch: 'Create an account', forgot: 'Forgot password?' },
  signup: { title: 'Join the kingdom', sub: 'create your private royal diary', btn: 'Create account ✨', pass: true, pw: 'new-password', switch: 'I already have an account', forgot: '' },
  forgot: { title: 'Reset password', sub: "we'll email you a magic link", btn: 'Send reset link ✉️', pass: false, pw: 'current-password', switch: 'Back to log in', forgot: '' },
  recovery: { title: 'New password', sub: 'choose a new password, princess', btn: 'Save new password 🔐', pass: true, pw: 'new-password', switch: '', forgot: '' },
};
function authMsg(text, kind) { const el = $('#authMsg'); el.textContent = text || ''; el.className = 'authmsg' + (kind ? ' ' + kind : ''); }
function setAuthMode(m) {
  authMode = m;
  const c = AUTH_COPY[m];
  $('#authTitle').textContent = c.title;
  $('#authSub').textContent = c.sub;
  $('#authBtn').textContent = c.btn;
  $('#aPassWrap').hidden = !c.pass;
  $('#aPass').setAttribute('autocomplete', c.pw);
  $('#aEmail').closest('form').querySelector('label[for=aEmail]').hidden = m === 'recovery';
  $('#aEmail').hidden = m === 'recovery';
  const sw = $('#lnkSwitch'), fg = $('#lnkForgot');
  sw.textContent = c.switch; sw.hidden = !c.switch;
  fg.textContent = c.forgot; fg.hidden = !c.forgot;
  authMsg('');
}
function friendly(msg) {
  const s = String(msg || '').toLowerCase();
  if (s.includes('invalid login')) return 'Wrong email or password 🥺';
  if (s.includes('not confirmed')) return 'Please confirm your email first 💌';
  if (s.includes('already registered')) return 'That email already has an account. Try logging in 💕';
  if (s.includes('signups not allowed') || s.includes('signup is disabled')) return 'New sign-ups are turned off. Ask the admin to create your account 👑';
  if (s.includes('password should be')) return 'Password must be at least 6 characters 🔐';
  if (s.includes('rate limit') || s.includes('too many')) return 'Too many tries. Please wait a minute and try again ⏳';
  if (s.includes('failed to fetch') || s.includes('network')) return 'No connection. Check your internet and try again 📶';
  return msg || 'Something went wrong 🥺';
}
async function submitAuth(ev) {
  ev.preventDefault();
  const email = $('#aEmail').value.trim();
  const pw = $('#aPass').value;
  const btn = $('#authBtn');
  if (authMode !== 'recovery' && !/^\S+@\S+\.\S+$/.test(email)) { authMsg('Enter a valid email 💌', 'err'); return; }
  if (AUTH_COPY[authMode].pass && pw.length < 6) { authMsg('Password must be at least 6 characters 🔐', 'err'); return; }
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'One sec… 💞'; authMsg('');
  try {
    if (authMode === 'signin') {
      const { session } = await auth.signIn(email, pw);
      $('#aPass').value = '';
      await handleSession(session);
    } else if (authMode === 'signup') {
      const { session } = await auth.signUp(email, pw);
      if (session) { $('#aPass').value = ''; await handleSession(session); }
      else { setAuthMode('signin'); authMsg('Almost there! Check your email to confirm, then log in 💌', 'ok'); }
    } else if (authMode === 'forgot') {
      await auth.reset(email);
      authMsg('Reset link sent! Check your inbox ✉️', 'ok');
    } else if (authMode === 'recovery') {
      await auth.setPassword(pw);
      recovering = false;
      $('#aPass').value = '';
      toast('Password updated 🔐💖');
      setAuthMode('signin');
      await handleSession(await auth.getSessionSafe());
    }
  } catch (e) {
    authMsg(friendly(e.message), 'err');
  } finally {
    btn.disabled = false;
    if (btn.textContent === 'One sec… 💞') btn.textContent = label;
  }
}

/* ============================== session / boot ============================== */
function showAuth() {
  $('#authBack').hidden = true;
  $('#loading').hidden = true;
  $('#app').hidden = true;
  $('#auth').hidden = false;
  updateChip();
  syncGuestBtn();
}
// the login screen opened on request (from the app), with a way back to the diary
function openLogin(msg) {
  setAuthMode('signin');
  showAuth();
  $('#authBack').hidden = false;
  if (msg) authMsg(msg, 'ok');
}
function syncGuestBtn() {
  const off = navigator.onLine === false;
  $('#guestBtn').hidden = !off;
  if (off && !$('#authMsg').textContent) authMsg("📴 You're offline. No login needed: tap Continue offline. Log in later to back up.");
}
function showApp() {
  $('#loading').hidden = true;
  $('#auth').hidden = true;
  $('#app').hidden = false;
  greet();
  renderAll();
  initNote();
  updateChip();
  checkOfflineReady();
}

async function handleSession(session) {
  if (recovering) return;
  if (!session) {
    state.uid = null;
    store.close();
    resetForm();
    setAuthMode('signin');
    showAuth();
    return;
  }
  if (!session.offline) { offlineSession = false; if (needsLogin) { needsLogin = false; updateChip(); } }
  if (state.uid === session.user.id && !$('#app').hidden) return;
  needsLogin = false;
  state.email = session.user.email || '';
  offlineSession = Boolean(session.offline);
  auth.remember(session.user);
  state.uid = session.user.id;
  $('#acct').textContent = '👤 Signed in as ' + (session.user.email || '');
  $('#acct').hidden = false;
  store.open(session.user.id); // instant: reads this phone's copy, no network needed
  const adopted = store.adoptGuest(); // entries she saved offline while logged out join her account
  if (adopted) toast(`${adopted} offline entr${adopted === 1 ? 'y' : 'ies'} added to your account 💖`);
  showApp();
  setTab(activeTab, false);
  keepStorage();
  syncNow();                   // quietly upload anything waiting, then fetch the latest
}

/* ============================== offline / sync status ============================== */
let lastPending = 0;

// Offline with nobody logged in: no login needed. Everything saves on the phone and is backed up
// to her account automatically the next time she logs in.
function enterGuest() {
  offlineSession = false;
  state.uid = 'guest';
  store.open('guest');
  $('#acct').hidden = true;
  showApp();
  setTab(activeTab, false);
  keepStorage();
}
const isGuest = () => state.uid === 'guest';
let needsLogin = false;      // the server no longer accepts the saved login: keep working, offer a gentle re-login
let loggingOut = false;
let offlineSession = false; // true while we're using the saved login without having confirmed it online

// Offline we trust the saved login. Once online, confirm it; only if the server says "log in again" do we ask,
// and the phone's unsent entries stay safe until she does.
async function verifyOfflineSession() {
  if (!offlineSession || navigator.onLine === false) return true;
  const r = await auth.checkSession();
  if (r === 'ok') { offlineSession = false; return true; }
  if (r === 'none') {
    // The server says she must log in again (e.g. password changed elsewhere). Don't lock her out of her diary:
    // keep the app open, keep saving on the phone, and show a small "Log in to sync" button.
    offlineSession = false;
    if (!needsLogin) { needsLogin = true; toast('Tap "Log in to sync" at the top to keep backing up 🔑'); }
    updateChip();
    return false;
  }
  return true; // network still flaky: keep working offline
}
async function syncNow() { if (await verifyOfflineSession()) return store.sync(); return { skipped: true }; }
function updateChip() {
  const el = $('#syncChip');
  if (!cloud || $('#app').hidden) { el.hidden = true; return; }
  $('#logout').hidden = isGuest();
  $('#changePw').hidden = isGuest();
  const s = store.status();
  let text, cls;
  if (isGuest()) { text = s.online ? '🔑 Log in to back up' : '📴 Offline · not logged in'; cls = s.online ? 'warn' : 'off'; }
  else if (needsLogin && s.online) { text = '🔑 Log in to sync'; cls = 'warn'; }
  else if (!s.online) { text = s.pending ? `📴 Offline · ${s.pending} waiting` : '📴 Offline'; cls = 'off'; }
  else if (s.syncing) { text = '🔄 Syncing…'; cls = 'busy'; }
  else if (s.pending) { text = `⏳ ${s.pending} waiting · tap to sync`; cls = 'warn'; }
  else if (s.failed) { text = `⚠️ ${s.failed} couldn't sync`; cls = 'warn'; }
  else { text = '☁️ Synced'; cls = 'ok'; }
  el.hidden = false;
  el.textContent = text;
  el.className = 'pill sync ' + cls;
  el.title = s.lastSync ? 'Last synced ' + new Date(s.lastSync).toLocaleTimeString() : 'Not synced yet';
  if (lastPending > 0 && s.pending === 0 && s.online && !s.syncing && !s.failed) toast('☁️ All synced! Your offline entries are safe 💖');
  lastPending = s.pending;
}

async function manualSync() {
  if (isGuest() || needsLogin) {
    if (navigator.onLine === false) { toast("You're offline. Everything is saved on your phone. Log in later to back it up 💕"); return; }
    openLogin(isGuest() ? 'Log in to back up your entries. They are safe on this phone 💕' : 'Please log in again to keep backing up. Your entries are safe on this phone 💕');
    return;
  }
  const s = store.status();
  if (!s.online) { toast("You're offline. Everything is saved on your phone and will upload by itself 💕"); return; }
  const r = await syncNow();
  if (r && r.ok) toast('☁️ Up to date');
  else if (r && !r.queued) toast("Couldn't reach the server. Will keep trying 🔁");
}

// Tell her whether the app is saved on the phone for offline use (so she can check BEFORE losing signal)
async function checkOfflineReady() {
  const el = $('#offlineReady');
  if (!('serviceWorker' in navigator) || !window.caches) { el.textContent = "⚠️ This browser can't save the app for offline use. Use Chrome (Android) or Safari (iPhone)."; return; }
  const none = new Promise((r) => setTimeout(() => r(null), 3500));
  const reg = await Promise.race([navigator.serviceWorker.ready.catch(() => null), none]);
  if (!reg) { el.textContent = 'ℹ️ Offline mode switches on in the deployed (https) app, after its first visit.'; return; }
  let hit = null;
  try { hit = await caches.match('/index.html', { ignoreSearch: true }); } catch (e) { /* ignore */ }
  el.textContent = hit ? '✅ Offline mode is ready. This app opens and saves with no internet.' : '⏳ Getting offline mode ready… keep the app open for a moment.';
  if (!hit) setTimeout(checkOfflineReady, 4000);
}

// ask the browser not to clear this app's saved data when the phone is low on space
async function keepStorage() {
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* ignore */ }
}

/* ============================== PWA: install + updates ============================== */
let installEvt = null;
function setupInstall() {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('#installBtn').hidden = false; });
  window.addEventListener('appinstalled', () => { installEvt = null; $('#installBtn').hidden = true; toast('Installed! Find it on your home screen 👑'); });
  $('#installBtn').addEventListener('click', async () => {
    if (!installEvt) return;
    installEvt.prompt();
    try { await installEvt.userChoice; } catch (e) { /* ignore */ }
    installEvt = null;
    $('#installBtn').hidden = true;
  });
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone;
  $('#iosHint').hidden = !ios;
}

let pendingUpdate = false;
let updateSW = () => {};
const formPristine = () => !selMood && !selTags.size && !selCare.size && !$('#note').value.trim();
function tryApplyUpdate() {
  // switch to a new version only when nothing is half-typed, so an update never eats a check-in
  if (pendingUpdate && formPristine() && !$('#app').hidden) { pendingUpdate = false; updateSW(true); }
}
function setupServiceWorker() {
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() { pendingUpdate = true; tryApplyUpdate(); },
    onOfflineReady() { checkOfflineReady(); },
    onRegisteredSW(url, reg) { if (reg) setInterval(() => { reg.update().catch(() => {}); }, 60 * 60 * 1000); },
  });
}

function openChangePassword() {
  if (navigator.onLine === false) { toast('Connect to the internet to change your password 🔐'); return; }
  if (!state.email) { toast('Please log in first 🔑'); return; }
  $('#modal').innerHTML = `<div class="bigem">🔐</div><h3>Change password</h3>
    <form id="pwForm" class="pwform" novalidate>
      <label class="lbl" for="pwOld">Current password</label><input type="password" id="pwOld" autocomplete="current-password">
      <label class="lbl" for="pwNew">New password</label><input type="password" id="pwNew" autocomplete="new-password">
      <label class="lbl" for="pwNew2">Confirm new password</label><input type="password" id="pwNew2" autocomplete="new-password">
      <div class="authmsg" id="pwMsg" role="status" aria-live="polite"></div>
      <button class="btn big" type="submit" id="pwSave">Save new password 💖</button>
      <button class="link" type="button" id="pwCancel">Cancel</button>
    </form>`;
  $('#overlay').classList.add('on');
  const say = (t, k) => { const m = $('#pwMsg'); m.textContent = t || ''; m.className = 'authmsg' + (k ? ' ' + k : ''); };
  $('#pwCancel').onclick = () => $('#overlay').classList.remove('on');
  $('#pwForm').onsubmit = async (ev) => {
    ev.preventDefault();
    const oldPw = $('#pwOld').value, n1 = $('#pwNew').value, n2 = $('#pwNew2').value;
    if (!oldPw) return say('Enter your current password 🔐', 'err');
    if (n1.length < 6) return say('New password must be at least 6 characters 🔐', 'err');
    if (n1 !== n2) return say("The new passwords don't match 🥺", 'err');
    if (n1 === oldPw) return say('Choose a password different from the current one 💕', 'err');
    const btn = $('#pwSave');
    btn.disabled = true; btn.textContent = 'Saving… 💞'; say('');
    try {
      await auth.changePassword(state.email, oldPw, n1);
      $('#overlay').classList.remove('on');
      toast('Password changed 🔐💖');
      confetti(25);
    } catch (e) {
      say(/different from the old/i.test(e.message || '') ? 'Choose a password different from the current one 💕' : friendly(e.message), 'err');
      btn.disabled = false; btn.textContent = 'Save new password 💖';
    }
  };
  setTimeout(() => { try { $('#pwOld').focus(); } catch (e) { /* ignore */ } }, 50);
}

async function doLogout() {
  if (!(await askConfirm({ emoji: '🚪', title: 'Sign out of this phone?', text: 'You will need to log in again.', yes: 'Sign out', no: 'Stay logged in' }))) return;
  loggingOut = true;
  try {
    if (store.pendingCount() && navigator.onLine !== false) await store.sync();
    const n = store.pendingCount();
    if (n && !(await askConfirm({ emoji: '⏳', title: `${n} entr${n === 1 ? 'y hasn\'t' : 'ies haven\'t'} uploaded yet`, text: 'They stay safely on this phone until you log back in. Sign out anyway?', yes: 'Sign out anyway', no: 'Stay logged in' }))) return;
    const unsynced = n > 0;
    await auth.signOut();
    if (!unsynced) store.purge(); // nothing waiting → also remove this phone's copy of the diary
    await handleSession(null);
  } catch (e) { oops('log out', e); } finally { loggingOut = false; }
}

function wire() {
  $('#nav').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setTab(b.dataset.tab); });
  $$('.dot').forEach((d) => d.addEventListener('click', () => applyTheme(d.dataset.t)));

  $('#moods').addEventListener('click', (ev) => {
    const b = ev.target.closest('.mood');
    if (!b) return;
    selMood = b.dataset.k;
    $$('.mood').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
    $('#moodmsg').textContent = pick(MOOD[selMood].m);
    swapIn($('#moodmsg'));
    $('#ambient').style.setProperty('--mc', MOOD[selMood].c);
    $('#wizard').style.setProperty('--mc', MOOD[selMood].c);
    const fm = $('#flowMood');
    fm.textContent = MOOD[selMood].e;
    fm.classList.remove('pop'); void fm.offsetWidth; fm.classList.add('pop');
    syncNav();
    buzz(12);
  });
  [['#tags', selTags], ['#care', selCare]].forEach(([id, set]) => $(id).addEventListener('click', (ev) => {
    const b = ev.target.closest('.chip');
    if (!b) return;
    const v = b.dataset.v;
    if (set.has(v)) { set.delete(v); b.classList.remove('on'); } else { set.add(v); b.classList.add('on'); }
    b.setAttribute('aria-pressed', String(set.has(v)));
    bounce(b, 0.88);
    if (set === selCare) {
      const n = selCare.size;
      $('#carePop').textContent = n === 0 ? '' : n >= CARE.length ? 'full royal treatment! 👑✨' : n >= 5 ? `${n} of ${CARE.length}. a total glow-up 💅` : n >= 3 ? `${n} of ${CARE.length}. look at you go 🌸` : `${n} of ${CARE.length}. every bit counts 💗`;
      swapIn($('#carePop'));
    }
    syncNav();
    buzz(8);
  }));
  ['energy', 'stress', 'social'].forEach((id) => $('#' + id).addEventListener('input', () => {
    syncSliders();
    const v = $('#v-' + id);
    v.classList.add('bump'); clearTimeout(v.t); v.t = setTimeout(() => v.classList.remove('bump'), 160);
    buzz(4);
  }));
  $('#startBtn').addEventListener('click', startFlow);
  $('#nextBtn').addEventListener('click', nextStep);
  $('#backBtn').addEventListener('click', () => { buzz(8); if (step === 1) closeFlow(); else goStep(step - 1); });
  $('#flowClose').addEventListener('click', closeFlow);
  $('#summary').addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) { buzz(8); goStep(+b.dataset.go); } });
  $('#whenBtn').addEventListener('click', () => {
    const box = $('#whenBox');
    box.hidden = !box.hidden;
    $('#whenBtn').textContent = box.hidden ? 'change' : 'done';
    $('#whenBtn').setAttribute('aria-expanded', String(!box.hidden));
    if (!box.hidden) { if (!whenTouched) $('#when').value = localInput(new Date()); try { $('#when').focus(); } catch (e) { /* ignore */ } }
  });
  $('#when').addEventListener('input', () => {
    const d = new Date($('#when').value);
    if (isNaN(d)) return;
    whenTouched = true;
    $('#whenTxt').textContent = '🕒 ' + d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  });
  $('#sealBtn').addEventListener('click', () => openLetter(false));
  $('#note').addEventListener('input', (e) => { $('#nc').textContent = e.target.value.length; syncNav(); });
  $('#save').addEventListener('click', saveEntry);

  $('#range').addEventListener('change', renderStats);
  $('#fMood').addEventListener('change', () => { state.diaryLimit = 60; renderDiary(); });
  $('#fText').addEventListener('input', () => { state.diaryLimit = 60; renderDiary(); });
  $('#moreDiary').addEventListener('click', () => { state.diaryLimit += 60; renderDiary(); });
  $('#diaryList').addEventListener('click', (e) => { const b = e.target.closest('.del'); if (b) deleteEntry(b.dataset.id); });

  $('#rRange').addEventListener('change', refreshPreview);
  $('#dlHtml').addEventListener('click', () => { download(`princess-mood-report-${stamp()}.html`, reportHTML(E(), rangeVal(), PRINCESS_NAME), 'text/html'); toast('Report downloaded 👑'); confetti(25); });
  $('#dlCsv').addEventListener('click', () => { download(`princess-mood-data-${stamp()}.csv`, csv(E(), rangeVal(), PRINCESS_NAME), 'text/csv'); toast('CSV downloaded 📄'); });
  $('#dlPrint').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([reportHTML(E(), rangeVal(), PRINCESS_NAME)], { type: 'text/html' }));
    const w = window.open(url, '_blank');
    if (!w) toast('Pop-up blocked. Download the report and print it 🖨️');
    else setTimeout(() => { try { w.print(); } catch (e) { /* ignore */ } }, 900);
  });
  if (navigator.share) { $('#shareBtn').hidden = false; $('#shareBtn').addEventListener('click', shareReport); }

  $('#sample').addEventListener('click', addSample);
  $('#unsample').addEventListener('click', removeSample);
  $('#clear').addEventListener('click', clearAll);
  $('#dlJson').addEventListener('click', () => { download(`princess-mood-backup-${stamp()}.json`, JSON.stringify({ name: PRINCESS_NAME, entries: E() }, null, 2), 'application/json'); toast('Backup saved 💾'); });
  $('#impBtn').addEventListener('click', () => $('#impFile').click());
  $('#impFile').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importFile(f); e.target.value = ''; });

  const closeOverlay = () => { $('#overlay').classList.remove('on'); if (pendingConfirm) { const f = pendingConfirm; pendingConfirm = null; f(false); } };
  $('#overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') closeOverlay(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOverlay(); });

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (activeTab === 'dash' && !$('#app').hidden) trend(); }, 200); });

  // auth
  $('#authForm').addEventListener('submit', submitAuth);
  $('#lnkSwitch').addEventListener('click', () => setAuthMode(authMode === 'signin' ? 'signup' : 'signin'));
  $('#lnkForgot').addEventListener('click', () => setAuthMode('forgot'));
  $('#logout').addEventListener('click', doLogout);
  $('#changePw').addEventListener('click', openChangePassword);
  $('#authBack').addEventListener('click', () => { $('#auth').hidden = true; $('#app').hidden = false; updateChip(); });
  $('#syncChip').addEventListener('click', manualSync);
  $('#guestBtn').addEventListener('click', () => { authMsg(''); enterGuest(); });

  // offline-first: sync whenever the phone gets signal or the app comes back to the front
  window.addEventListener('online', () => {
    if (!$('#auth').hidden) { $('#guestBtn').hidden = true; if (/offline/i.test($('#authMsg').textContent)) authMsg(''); }
    if (isGuest()) { toast('Back online! Log in to back up your entries 💕'); updateChip(); return; }
    toast('Back online 💕');
    syncNow();
  });
  window.addEventListener('offline', () => { if (!$('#auth').hidden) { syncGuestBtn(); return; } toast("You're offline. Everything still saves on your phone 💕"); updateChip(); });
  let lastVis = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    tryApplyUpdate();
    if (!$('#app').hidden) { greet(); renderHero(); initNote(); } // the date (and the note) roll over at midnight
    if (Date.now() - lastVis > 15000) { lastVis = Date.now(); syncNow(); }
  });
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 5 * 60 * 1000);
  store.onStatus(updateChip);
  store.onData(() => { if (!$('#app').hidden) renderAll(); });
}

async function boot() {
  applyTheme(savedTheme());
  buildFloaties();
  buildForm();
  wire();
  setupInstall();
  setupServiceWorker();
  const h = location.hash.replace('#', '');
  if (TABS.includes(h)) activeTab = h;

  if (!cloud) {
    $('#localBanner').hidden = false;
    $('#storageNote').textContent = 'Local mode: data is saved privately in this browser only. Download a backup to keep it safe 💕';
    store.open('local');
    showApp();
    setTab(activeTab, false);
    keepStorage();
    return;
  }

  $('#storageNote').textContent = 'Saved on this phone first, then backed up to your account whenever you\'re online, so it also follows you to any device 💕';
  $('#logout').hidden = false;
  $('#changePw').hidden = false;
  setAuthMode('signin');
  auth.onChange((event, session) => {
    // don't await supabase calls inside this callback; defer instead
    setTimeout(() => {
      if (event === 'PASSWORD_RECOVERY') { recovering = true; setAuthMode('recovery'); showAuth(); return; }
      if (event === 'SIGNED_OUT') {
        if (navigator.onLine === false || loggingOut) return; // never kick her out because of a missing connection
        if (!state.uid && auth.remembered()) return;           // startup: boot() opens her diary from the saved login
        if (state.uid && !isGuest()) { needsLogin = true; updateChip(); return; } // keep her diary open; offer re-login
        handleSession(null);
        return;
      }
      if (event === 'TOKEN_REFRESHED') { offlineSession = false; store.sync(); return; }
      // a null session on startup can just mean "offline with an old token": boot() decides that below
      if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session) handleSession(session);
    }, 0);
  });
  if (recovering) { setAuthMode('recovery'); showAuth(); return; }
  try {
    const sess = await auth.getSessionSafe(); // works offline too, using the saved login
    if (!recovering) {
      if (!sess && navigator.onLine === false) enterGuest(); // offline and never logged in here: no login needed
      else await handleSession(sess);
    }
  } catch (e) {
    console.error(e);
    showAuth();
  }
}

boot();
