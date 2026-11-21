export const $ = (s) => document.querySelector(s);
export const $$ = (s) => Array.from(document.querySelectorAll(s));

export const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const localInput = (d) => dayKey(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
export const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
export const fmtTime = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(+n) ? +n : lo));

export function download(name, text, type) {
  const b = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}

export const buzz = (ms = 10) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* not supported */ } };
