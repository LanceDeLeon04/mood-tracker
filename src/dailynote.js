// The sealed "note of the day".
//
//  - One note per calendar day, the same all day long (cached on the phone), a new one at midnight.
//  - The note is imported from a public quotes API (see NOTE_API). If the phone is offline or the API is down,
//    a hand-written bank below is used instead, so the seal can always be opened.
//  - Which note she gets is chosen quietly from the recent diary. Nothing about that is shown in the UI.
import { MOOD } from './config.js';
import { dayKey } from './utils.js';

// Swap this to use another source. It must return { quotes: [{ quote, author }] } (the DummyJSON shape).
const NOTE_API = 'https://dummyjson.com/quotes';
const API_WINDOW = 60;          // quotes pulled per day, then the best fit for the day is chosen from them
const API_TOTAL_GUESS = 1400;   // the API holds ~1450 quotes; skip is wrapped so it always stays inside
const TIMEOUT_MS = 6000;
const CACHE_KEY = 'scs_note_cache_v1';
const OPEN_KEY = 'scs_note_open_v1';

/* ------------------------------ choosing a tone ------------------------------ */
// Look at the last check-in from before today (only if it's recent) and decide what kind of note fits.
export function toneFor(entries, now = new Date()) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const floor = start.getTime() - 3 * 864e5;
  let last = null;
  for (const e of entries || []) {
    const t = new Date(e.ts).getTime();
    if (!(t < start.getTime() && t >= floor)) continue;
    if (!last || t > new Date(last.ts).getTime()) last = e;
  }
  const m = last && MOOD[last.mood];
  if (!m) return 'warm';
  if (m.s <= 2) return 'lift';
  if (m.s === 3) return 'soothe';
  return m.k === 'slay' || m.k === 'glow' ? 'celebrate' : 'sustain';
}

/* ------------------------------ the local bank ------------------------------ */
const R = 'The Royal Court';
const BANK = {
  lift: [
    ['Fall seven times, stand up eight.', 'Japanese proverb'],
    ['Hope is being able to see that there is light despite all of the darkness.', 'Desmond Tutu'],
    ['Tough times never last, but tough people do.', 'Robert H. Schuller'],
    ['Nothing can dim the light which shines from within.', 'Maya Angelou'],
    ["Courage doesn't always roar. Sometimes courage is the quiet voice at the end of the day saying, \u2018I will try again tomorrow.\u2019", 'Mary Anne Radmacher'],
    ['A heavy day is a chapter, not the whole story.', R],
    ["You don't have to be okay today. You only have to be kind to yourself.", R],
    ['Tomorrow is a fresh page, and you are still the one holding the pen.', R],
  ],
  soothe: [
    ['Nature does not hurry, yet everything is accomplished.', 'Lao Tzu'],
    ['Almost everything will work again if you unplug it for a few minutes, including you.', 'Anne Lamott'],
    ['Rest is part of the plan, not a break from it.', R],
    ['Small steps are still steps, and slow is a perfectly royal pace.', R],
    ['Do one gentle thing today and let that be enough.', R],
    ['You are allowed to move at the speed of cozy.', R],
  ],
  sustain: [
    ['Happiness is not by chance, but by choice.', 'Jim Rohn'],
    ['Wherever you go, go with all your heart.', 'Confucius'],
    ['Bloom where you are planted.', 'Proverb'],
    ['Notice what is working today and say thank you to it.', R],
    ['Keep the good thing going, softly and on purpose.', R],
    ['Little joys add up to a very big life.', R],
  ],
  celebrate: [
    ['Go confidently in the direction of your dreams.', 'Henry David Thoreau'],
    ["You're not just shining today, you're lighting the way for others.", R],
    ['Bold looks good on you. Wear it again today.', R],
    ['Dream big, sparkle bigger.', R],
    ['The room is better with you in it, so walk in like you know it.', R],
    ['Say yes to the thing that makes your heart do a little spin.', R],
  ],
  warm: [
    ['Every day is a brand new page.', R],
    ['Kindness is the quiet kind of power.', R],
    ['Today has room for something lovely.', R],
    ['Start small, start soft, just start.', R],
    ['Be the sparkle in someone\u2019s ordinary day.', R],
  ],
};

/* ------------------------------ helpers ------------------------------ */
// Whole days since 1970 for the phone's LOCAL date, so the note changes at her midnight, not at UTC midnight.
function dayNumber(now) { return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5); }
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function localNote(tone, now = new Date()) {
  const list = BANK[tone] || BANK.warm;
  const [text, author] = list[hash(dayKey(now) + tone) % list.length];
  return { d: dayKey(now), t: tone, text, author, src: 'local' };
}

/* Words that lean toward each kind of note. Matched as word starts, case-insensitive. */
const LEAN = {
  lift: ['hope', 'light', 'rise', 'sun', 'dawn', 'tomorrow', 'again', 'storm', 'strong', 'strength', 'brave', 'courage', 'believe', 'heal', 'begin', 'fresh', 'grow', 'kind', 'gentle', 'possible', 'worth', 'enough', 'love', 'together', 'overcome', 'persever', 'resilien', 'bloom', 'wonder', 'beautiful', 'step', 'patien'],
  soothe: ['rest', 'slow', 'patien', 'calm', 'peace', 'quiet', 'breath', 'gentle', 'step', 'simple', 'still', 'moment', 'present', 'ease', 'pause', 'journey', 'small', 'kind', 'let go', 'enough'],
  sustain: ['happ', 'gratitude', 'grateful', 'joy', 'enjoy', 'smile', 'kind', 'laugh', 'bloom', 'grow', 'heart', 'love', 'cherish', 'beautiful', 'little', 'simple', 'good', 'choose', 'thank'],
  celebrate: ['shine', 'dream', 'bold', 'brave', 'create', 'passion', 'adventure', 'magic', 'spark', 'joy', 'confiden', 'fearless', 'bright', 'light', 'achiev', 'possible', 'beautiful', 'power', 'believe', 'imagin'],
  warm: ['kind', 'love', 'joy', 'hope', 'beautiful', 'smile', 'heart', 'today', 'gentle', 'happ'],
};
// Never let these through. A note should never make a rough day heavier, or take a side.
const NEVER = /\b(death|dead|die|dies|dying|kill\w*|hate\w*|hell|war|wars|stupid|fool\w*|idiot\w*|suicid\w*|devil|evil|sin|sins|enem\w+|ugly|weak|lazy|regret\w*|revenge|punish\w*|god|lord|jesus|christ|allah|heaven|pray\w*|bible|president|politic\w*|govern\w*|men|women|sex\w*|stupid|money|rich|wealth\w*|poor|failure|fail|fails|failed|fear|afraid|suffer\w*|pain\w*|hurt\w*|lose|lost|loser|cry|tears|sad|enemy|worst)\b/i;

function leanScore(text, tone) {
  const t = text.toLowerCase();
  let n = 0;
  for (const w of LEAN[tone] || LEAN.warm) if (new RegExp('\\b' + w).test(t)) n++;
  return n;
}
const usable = (q) => q && typeof q.quote === 'string' && typeof q.author === 'string'
  && q.quote.length >= 20 && q.quote.length <= 150 && !NEVER.test(q.quote) && !NEVER.test(q.author);

/** Pick the best-fitting quote from a batch. Returns null if nothing in the batch really fits. */
export function chooseFrom(batch, tone, now = new Date()) {
  const need = tone === 'lift' ? 2 : 1;
  const scored = (batch || []).filter(usable)
    .map((q) => ({ q, s: leanScore(q.quote, tone) }))
    .filter((x) => x.s >= need);
  if (!scored.length) return null;
  const top = Math.max(...scored.map((x) => x.s));
  const best = scored.filter((x) => x.s === top).sort((a, b) => a.q.quote.localeCompare(b.q.quote));
  const pick = best[hash(dayKey(now) + 'pick') % best.length].q;
  return { d: dayKey(now), t: tone, text: pick.quote.trim(), author: pick.author.trim(), src: 'web' };
}

/** Import today's note from the web. Resolves to a note, or null if offline / nothing suitable. */
export async function fetchNote(tone, now = new Date(), fetchFn = fetch) {
  const skip = (dayNumber(now) * 53) % API_TOTAL_GUESS;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(`${NOTE_API}?limit=${API_WINDOW}&skip=${skip}&select=quote,author`, { signal: ctl.signal });
    if (!res.ok) return null;
    const data = await res.json();
    return chooseFrom(data && data.quotes, tone, now);
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------ per-day memory on the phone ------------------------------ */
export function cachedNote(now = new Date()) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return c && c.d === dayKey(now) && typeof c.text === 'string' ? c : null;
  } catch (e) { return null; }
}
export function saveNote(n) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(n)); } catch (e) { /* ignore */ } }
export const wasOpened = (now = new Date()) => { try { return localStorage.getItem(OPEN_KEY) === dayKey(now); } catch (e) { return false; } };
export const markOpened = (now = new Date()) => { try { localStorage.setItem(OPEN_KEY, dayKey(now)); } catch (e) { /* ignore */ } };
