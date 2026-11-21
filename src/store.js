// Offline-first data layer.
//
//  Every change is written to a cache on the phone FIRST (instant, works with no signal) and put in an
//  "outbox" queue. When there's a connection the queue is uploaded to Supabase, then the latest data is pulled
//  back down. Entries get their id on the device (a UUID), so a retried upload can never create duplicates.
//
//  - Supabase env vars set → Supabase Auth + Postgres (row-level security keeps each diary private) + sync.
//  - No env vars           → "local mode": same cache, no login, nothing to sync.
import { createClient } from '@supabase/supabase-js';
import { MOOD } from './config.js';
import { clamp } from './utils.js';

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const cloud = Boolean(SB_URL && SB_KEY);
export const supabase = cloud
  ? createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

const TABLE = 'mood_entries';
const COLS = 'id,logged_at,mood,energy,stress,social,tags,care,note,is_sample';
const CACHE_PREFIX = 'scs_cache_v2_';
const OLD_LOCAL_KEY = 'scs_princess_mood_v1'; // single-file version / earlier local mode
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Turn anything (form input, old backup file, sample data) into a safe row. Returns null if unusable. */
export function cleanEntry(x) {
  if (!x || !MOOD[x.mood]) return null;
  const d = new Date(x.ts);
  if (isNaN(d)) return null;
  const list = (v) => (Array.isArray(v) ? v.slice(0, 30).map((s) => String(s).slice(0, 60)) : []);
  const row = {
    ts: d.toISOString(),
    mood: x.mood,
    energy: Math.round(clamp(x.energy, 0, 10)),
    stress: Math.round(clamp(x.stress, 0, 10)),
    social: Math.round(clamp(x.social, 0, 10)),
    tags: list(x.tags),
    care: list(x.care),
    note: String(x.note || '').slice(0, 400),
    is_sample: Boolean(x.is_sample),
  };
  if (typeof x.id === 'string' && UUID.test(x.id)) row.id = x.id;
  return row;
}

/* ============================ Supabase calls ============================ */
// The DB column is `logged_at`; the app uses `ts` everywhere.
const fromDb = (r) => { const { logged_at, ...rest } = r; return { ...rest, ts: logged_at }; };
const toDb = (r) => { const { ts, ...rest } = r; return { ...rest, logged_at: ts }; };
const chunks = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

const remote = {
  async list() {
    let all = [];
    for (let from = 0; ; from += 1000) {
      const res = await supabase.from(TABLE).select(COLS).order('logged_at', { ascending: true }).range(from, from + 999);
      if (res.error) return res;
      all = all.concat(res.data);
      if (res.data.length < 1000) break;
    }
    return { rows: all.map(fromDb), error: null, status: 200 };
  },
  // "insert, or do nothing if this id is already there" → safe to retry any number of times
  add: (rows) => supabase.from(TABLE).upsert(rows.map(toDb), { onConflict: 'id', ignoreDuplicates: true }),
  del: (id) => supabase.from(TABLE).delete().eq('id', id),
  delSamples: () => supabase.from(TABLE).delete().eq('is_sample', true),
  delAll: () => supabase.from(TABLE).delete().not('id', 'is', null),
};

/** 'ok' | 'retry' (offline / server hiccup) | 'auth' (needs a fresh login token) | 'fatal' (server rejected the data) */
function classify(res) {
  if (!res || !res.error) return 'ok';
  const st = res.status || 0;
  const msg = String(res.error.message || '');
  if (st === 401 || st === 403 || /jwt/i.test(msg)) return 'auth';
  if (st === 400 || st === 409 || st === 413 || st === 422) return 'fatal'; // the server rejected this exact data
  return 'retry'; // offline, server hiccup, anything unclear: keep the entry queued, never drop it
}

/* ============================ the offline engine ============================ */
let uid = null;
let entries = [];
let outbox = [];   // [{k:'add',rows:[…]} | {k:'del',id} | {k:'delSamples'} | {k:'delAll'}]
let failed = [];   // operations the server permanently rejected (kept so nothing is silently lost)
let lastSync = null;
let lastError = null;
let syncing = false;
let rerun = false;
let retryTimer = null;
let retryN = 0;
let storageFull = false;
const dataListeners = new Set();
const statusListeners = new Set();

const isOnline = () => navigator.onLine !== false;
// 'guest' = saved on the phone while nobody is logged in (offline, no login needed). Never uploaded as-is:
// it is adopted by the account the next time she logs in.
const syncable = () => cloud && uid && uid !== 'guest';
const cacheKey = () => CACHE_PREFIX + uid;

function persist() {
  if (!uid) return;
  try {
    const clean = outbox.map((op) => { const { inflight, ...rest } = op; return rest; });
    localStorage.setItem(cacheKey(), JSON.stringify({ entries, outbox: clean, failed, lastSync }));
    storageFull = false;
  } catch (e) { storageFull = true; }
}
function emit(kind) {
  if (kind === 'data') dataListeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
  statusListeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
}

function pendingCount() {
  return outbox.reduce((n, op) => n + (op.k === 'add' ? op.rows.length : 1), 0);
}
function pendingIds() {
  const s = new Set();
  outbox.forEach((op) => { if (op.k === 'add') op.rows.forEach((r) => s.add(r.id)); });
  return s;
}

function enqueueAdd(rows) {
  const last = outbox[outbox.length - 1];
  if (last && last.k === 'add' && !last.inflight && last.rows.length + rows.length <= 200) last.rows.push(...rows);
  else chunks(rows, 200).forEach((c) => outbox.push({ k: 'add', rows: c }));
}
/** Drop not-yet-uploaded adds that match; returns how many. (An add that is uploading right now is left alone.) */
function stripPendingAdds(pred) {
  let n = 0;
  outbox = outbox
    .map((op) => {
      if (op.k !== 'add' || op.inflight) return op;
      const keep = op.rows.filter((r) => !pred(r));
      n += op.rows.length - keep.length;
      return keep.length === op.rows.length ? op : { ...op, rows: keep };
    })
    .filter((op) => op.k !== 'add' || op.rows.length);
  return n;
}
function applyOutbox(list) {
  let out = list.slice();
  let ids = new Set(out.map((e) => e.id));
  for (const op of outbox) {
    if (op.k === 'add') op.rows.forEach((r) => { if (!ids.has(r.id)) { out.push(r); ids.add(r.id); } });
    else if (op.k === 'del') { out = out.filter((e) => e.id !== op.id); ids.delete(op.id); }
    else if (op.k === 'delSamples') { out = out.filter((e) => !e.is_sample); ids = new Set(out.map((e) => e.id)); }
    else if (op.k === 'delAll') { out = []; ids = new Set(); }
  }
  return out;
}

function exec(op) {
  if (op.k === 'add') return remote.add(op.rows);
  if (op.k === 'del') return remote.del(op.id);
  if (op.k === 'delSamples') return remote.delSamples();
  return remote.delAll();
}

/** Upload queued changes in order. Returns true when the queue is empty. */
async function flush() {
  if (outbox.length) {
    let signedIn = false;
    try { const { data } = await supabase.auth.getSession(); signedIn = Boolean(data && data.session); } catch (e) { /* offline */ }
    if (!signedIn) { lastError = 'not signed in'; return false; } // keep everything queued until she logs in
  }
  while (outbox.length) {
    const op = outbox[0];
    op.inflight = true;
    let res;
    try { res = await exec(op); } catch (e) { res = { error: { message: String((e && e.message) || e) }, status: 0 }; }
    delete op.inflight;
    const c = classify(res);
    if (c === 'ok') { outbox = outbox.filter((o) => o !== op); persist(); continue; }
    lastError = (res.error && res.error.message) || 'sync failed';
    if (c === 'fatal') {
      if (op.k === 'add' && op.rows.length > 1) {
        // isolate the bad row: retry one by one
        outbox = [...op.rows.map((r) => ({ k: 'add', rows: [r] })), ...outbox.filter((o) => o !== op)];
      } else {
        failed.push({ op, error: lastError, at: Date.now() });
        outbox = outbox.filter((o) => o !== op);
      }
      persist();
      continue;
    }
    return false; // offline / auth problem: stop, keep everything, try again later
  }
  return true;
}

async function sync() {
  if (!syncable()) return { skipped: true };
  if (syncing) { rerun = true; return { queued: true }; }
  if (!isOnline()) { emit('status'); return { offline: true }; }
  syncing = true;
  emit('status');
  let ok = false;
  try {
    if (await flush()) {
      const before = JSON.stringify(entries);
      const res = await remote.list();
      if (!res.error) {
        entries = applyOutbox(res.rows);
        lastSync = Date.now();
        lastError = null;
        retryN = 0;
        persist();
        ok = true;
        syncing = false;
        emit(before === JSON.stringify(entries) ? 'status' : 'data');
      } else {
        lastError = res.error.message;
      }
    }
  } catch (e) {
    lastError = String((e && e.message) || e);
  } finally {
    syncing = false;
  }
  emit('status');
  if (rerun) { rerun = false; sync(); } else if (!ok) scheduleRetry();
  return { ok };
}

function scheduleRetry() {
  if (retryTimer || !outbox.length || !isOnline()) return;
  retryN = Math.min(retryN + 1, 7);
  const delay = Math.min(300000, 4000 * 2 ** (retryN - 1));
  retryTimer = setTimeout(() => { retryTimer = null; sync(); }, delay);
}
const kick = () => { if (syncable() && isOnline()) sync(); };

/* ============================ public API ============================ */
export const store = {
  /** Load this user's cache from the device. Instant: no network. */
  open(userId) {
    uid = userId || 'local';
    entries = []; outbox = []; failed = []; lastSync = null; lastError = null; retryN = 0;
    try {
      const raw = localStorage.getItem(cacheKey());
      if (raw) {
        const c = JSON.parse(raw);
        entries = Array.isArray(c.entries) ? c.entries : [];
        outbox = Array.isArray(c.outbox) ? c.outbox : [];
        failed = Array.isArray(c.failed) ? c.failed : [];
        lastSync = c.lastSync || null;
      } else if (!cloud) {
        // bring over data saved by the older single-file / local-only version
        const old = JSON.parse(localStorage.getItem(OLD_LOCAL_KEY) || 'null');
        if (old && Array.isArray(old.entries)) {
          entries = old.entries.map((e) => ({ ...e, id: UUID.test(e.id) ? e.id : uuid() }));
          persist();
        }
      }
    } catch (e) { /* unreadable cache: start empty */ }
    emit('data');
    return entries;
  },
  close() { uid = null; entries = []; outbox = []; failed = []; clearTimeout(retryTimer); retryTimer = null; emit('data'); },
  /** Forget this device's copy (only used on log-out when nothing is waiting to upload). */
  purge() { if (uid) { try { localStorage.removeItem(cacheKey()); } catch (e) { /* ignore */ } } },

  /** Move entries saved while logged out (offline guest mode) into the logged-in account; call right after open(). */
  adoptGuest() {
    if (!syncable()) return 0;
    let rows = [];
    try { const c = JSON.parse(localStorage.getItem(CACHE_PREFIX + 'guest') || 'null'); rows = (c && Array.isArray(c.entries)) ? c.entries : []; } catch (e) { return 0; }
    if (!rows.length) { try { localStorage.removeItem(CACHE_PREFIX + 'guest'); } catch (e) { /* ignore */ } return 0; }
    const added = store.addMany(rows);
    if (!storageFull) { try { localStorage.removeItem(CACHE_PREFIX + 'guest'); } catch (e) { /* ignore */ } } // only after they're safely stored
    return added.length;
  },

  entries: () => entries,
  pendingIds,
  pendingCount,
  status: () => ({ online: isOnline(), syncing, pending: pendingCount(), failed: failed.length, lastSync, error: lastError, storageFull }),
  onData: (f) => { dataListeners.add(f); return () => dataListeners.delete(f); },
  onStatus: (f) => { statusListeners.add(f); return () => statusListeners.delete(f); },
  sync,

  add(row) {
    const e = { ...row, id: row.id || uuid() };
    if (entries.some((x) => x.id === e.id)) return e;
    entries = entries.concat(e);
    if (syncable()) enqueueAdd([e]);
    persist(); emit('status'); kick();
    return e;
  },
  addMany(rows) {
    const have = new Set(entries.map((e) => e.id));
    const added = [];
    for (const r of rows) {
      const e = { ...r, id: r.id || uuid() };
      if (have.has(e.id)) continue;
      have.add(e.id); added.push(e);
    }
    if (!added.length) return added;
    entries = entries.concat(added);
    if (syncable()) enqueueAdd(added);
    persist(); emit('status'); kick();
    return added;
  },
  remove(id) {
    entries = entries.filter((e) => e.id !== id);
    if (syncable() && stripPendingAdds((r) => r.id === id) === 0) outbox.push({ k: 'del', id });
    persist(); emit('status'); kick();
  },
  removeSamples() {
    entries = entries.filter((e) => !e.is_sample);
    if (syncable()) { stripPendingAdds((r) => r.is_sample); outbox.push({ k: 'delSamples' }); }
    persist(); emit('status'); kick();
  },
  removeAll() {
    entries = [];
    if (syncable()) { outbox = outbox.filter((op) => op.inflight); outbox.push({ k: 'delAll' }); }
    persist(); emit('status'); kick();
  },
};

/* ============================ auth (Supabase only) ============================ */
const LAST_USER = 'scs_last_user_v1';
function storedSessionUser() {
  try {
    const key = 'sb-' + new URL(SB_URL).hostname.split('.')[0] + '-auth-token';
    const s = JSON.parse(localStorage.getItem(key) || 'null');
    if (s && s.user && s.user.id) return { id: s.user.id, email: s.user.email || '' };
  } catch (e) { /* fall through to our own copy */ }
  try {
    const u = JSON.parse(localStorage.getItem(LAST_USER) || 'null');
    return u && u.id ? { id: u.id, email: u.email || '' } : null;
  } catch (e) { return null; }
}

export const auth = {
  /** Keep our own copy of "who is logged in on this phone" so the diary can always open offline. */
  remember(user) { try { localStorage.setItem(LAST_USER, JSON.stringify({ id: user.id, email: user.email || '' })); } catch (e) { /* ignore */ } },
  forget() { try { localStorage.removeItem(LAST_USER); } catch (e) { /* ignore */ } },
  /** 'ok' = valid login · 'retry' = can't tell (bad network) · 'none' = the server says she must log in again */
  async checkSession() {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (data && data.session) return 'ok';
      if (error && (error.name === 'AuthRetryableFetchError' || /fetch|network|timeout/i.test(error.message || ''))) return 'retry';
      return 'none';
    } catch (e) { return 'retry'; }
  },
  /** The signed-in session, or — if the phone is offline and the token can't be refreshed — a stand-in built from
   *  the saved login, so the diary still opens with no signal. */
  async getSessionSafe() {
    const stored = storedSessionUser();
    // Offline: don't wait on the network at all (supabase-js would retry the token refresh for ~30s).
    if (!isOnline() && stored) return { user: stored, offline: true };
    try {
      const wait = new Promise((resolve) => setTimeout(() => resolve(null), stored ? 3000 : 8000));
      const res = await Promise.race([supabase.auth.getSession(), wait]);
      if (res && res.data && res.data.session) return res.data.session;
    } catch (e) { /* offline or slow */ }
    return stored ? { user: stored, offline: true } : null;
  },
  onChange(cb) { return supabase.auth.onAuthStateChange(cb); },
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },
  async signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    if (error) throw error;
    return data;
  },
  async signOut() {
    auth.forget();
    // 'local' works with no signal; try the full sign-out (revokes the token on the server) when online
    if (isOnline()) { const { error } = await supabase.auth.signOut(); if (!error) return; }
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
  },
  async reset(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) throw error;
  },
  async setPassword(password) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  },
};
