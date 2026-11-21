// Static content for the app: moods, factors, self-care rituals and fun copy.

export const PRINCESS_NAME = (import.meta.env.VITE_PRINCESS_NAME || 'Tina').trim() || 'Tina';
export const PICK_MSG = 'Pick a mood, bebs 💕';

// Used to tint the phone's browser bar to match the palette.
export const THEME_COLORS = {
  pink: '#ff5fa8',
  lavender: '#9b6bff',
  peach: '#ff8a5b',
  mint: '#2fc59a',
};

export const MOODS = [
  { k: 'slay', e: '💅', n: 'Slaying', s: 5, c: '#ff5fa8',
    m: ['Slay, queen! The kingdom is lucky to have you 👑', 'Main character energy detected 💅✨', 'Hair flip. Door opened. Deal closed. 💁‍♀️'],
    adv: ['Ride the wave: this is the perfect time to pitch that partnership or tackle the big task.', 'Share the sparkle! Hype up a teammate today.', 'Write down what worked today so you can recreate this magic.'] },
  { k: 'glow', e: '✨', n: 'Glowing', s: 5, c: '#ffb703',
    m: ['Absolutely radiant today 🌟', 'Glitter in the veins, stars in the eyes ✨', "You're literally glowing, bestie!"],
    adv: ['Soak it in. Take a cute photo for future-you.', 'Great day for networking and outreach. People will feel your glow.', 'Treat yourself to a little reward for being amazing.'] },
  { k: 'happy', e: '🌸', n: 'Sweet & Happy', s: 4, c: '#ff8fb8',
    m: ['Soft, sweet, and smiling 🌷', 'Little flowers growing in your heart 🌸', 'Happy princess = happy kingdom 💕'],
    adv: ['Keep the good vibes going with your favorite playlist.', 'Send a thank-you message to someone who helped you this week.', 'Plan something fun to look forward to.'] },
  { k: 'chill', e: '🧋', n: 'Chill & Cozy', s: 4, c: '#c9a27a',
    m: ['Boba in hand, zero panic 🧋', 'Calm, cozy, and collected 🫧', 'Soft girl era activated 🧸'],
    adv: ['A calm mood is great for planning and tidying your task list.', 'Catch up on messages at your own pace, no rush.', "Journal about what's making you feel at peace."] },
  { k: 'meh', e: '🫠', n: 'Meh / Melting', s: 3, c: '#b9a7d6',
    m: ["Some days are just beige. That's okay 🫶", 'Melting a little, but still royalty 🫠', 'Not bad, not great. Just a pause day ☁️'],
    adv: ['Do one tiny thing you enjoy, like a snack or a song.', 'Lower the bar today: pick your top 2 tasks only.', 'A short walk or fresh air can lift the beige.'] },
  { k: 'sleepy', e: '😴', n: 'Sleepy', s: 3, c: '#8aa6ff',
    m: ['Your crown is heavy today. Rest, princess 😴', 'Beauty sleep requested 🌙', 'Recharge mode: loading… 🔋'],
    adv: ['Hydrate, stretch, and try a 15-minute power nap if you can.', 'Move big decisions to tomorrow.', 'Aim for an early bedtime tonight.'] },
  { k: 'stressed', e: '😵‍💫', n: 'Overwhelmed', s: 2, c: '#ff8a5b',
    m: ['Deep breath, princess. One thing at a time 🫧', 'The kingdom can wait five minutes. Breathe 💨', "You're doing more than you think 💗"],
    adv: ['Brain-dump everything, then circle the top 3 priorities.', 'Ask your Council sisters/brothers for backup. Delegating is royal.', 'Take a 10-minute screen-free break before the next task.'] },
  { k: 'sad', e: '🥺', n: 'Teary', s: 2, c: '#6fb4ff',
    m: ['Sending the biggest virtual hug 🫂💗', "It's okay to cry. Even princesses do 🌧️", "Soft days are valid. You're not alone 🌈"],
    adv: ['Talk to someone you trust. A friend, a mentor, or a council buddy.', 'Comfort ritual time: warm drink, cozy blanket, favorite show.', "Be gentle with yourself. Your worth isn't your productivity."] },
  { k: 'angry', e: '😤', n: 'Fierce / Irritated', s: 2, c: '#ff5a5f',
    m: ['Steam is coming out of the tiara 😤', 'Boundaries are in session 🚫👑', 'Even queens get cranky. Let it out safely 🔥'],
    adv: ['Step away for a few minutes before replying to anything.', 'Name what\'s bothering you, then pick one thing you can control.', 'Move your body: dance it out or take a quick walk.'] },
  { k: 'crisis', e: '🥀', n: 'Crown Slipping', s: 1, c: '#9b5de5',
    m: ["It's a really heavy day. You deserve support 💜", "Please don't carry this alone, princess 🫂", 'Rough patch, not forever. Reach out 💌'],
    adv: ["Reach out today to a trusted friend, adviser, or the council. You don't have to explain everything.", 'Skip non-urgent tasks. Rest, eat, drink water.', 'If things feel too heavy, please talk to a counselor or a trusted adult. Support is a sign of strength.'] },
];
export const MOOD = Object.fromEntries(MOODS.map((m) => [m.k, m]));

export const TAGS = [
  ['🗓️', 'Meetings'], ['🎉', 'Events'], ['⏰', 'Deadlines'], ['📣', 'Partnerships'],
  ['🤝', 'Outreach'], ['💬', 'Messages & emails'], ['👯', 'Friends'], ['📚', 'Academics'],
  ['🧋', 'Boba / coffee'], ['🌧️', 'Drama'], ['🥱', 'Lack of sleep'], ['🏠', 'Family'],
  ['💖', 'Compliments'], ['🎶', 'Good music'], ['🚌', 'Commute'], ['🌦️', 'Weather'],
];

export const CARE = [
  ['💧', 'Drank water'], ['🍱', 'Ate a real meal'], ['🧴', 'Self-care / skincare'], ['😴', '7+ hrs sleep'],
  ['🚶‍♀️', 'Took a break'], ['🎧', 'Fave songs'], ['📵', 'Social media detox'], ['🫶', 'Talked to a friend'],
];

export const COMPLIMENTS = [
  'You make the whole room brighter 🌟', 'Your kindness is your best accessory 💖', 'Smart, stylish, and unstoppable 👑',
  'Your presence makes the Council stronger 💪', 'Role model behavior, no notes 📝', 'The external affairs glow-up is you ✨',
  'Charming people is basically your superpower 🪄', 'You handle pressure like a pro 💅',
];

export const QUOTES = [
  'A princess is never late. The kingdom simply waits 👑', "Be the sparkle in someone's ordinary day ✨", 'Kind is the new fierce 💗',
  'Rest is productive too 🌙', 'Glitter is a lifestyle, not a phase 🦄', 'Soft heart, strong boundaries 🌸',
  'Tiara straight, standards high 💎', 'She believed she could, so she did 💅', "Bloom where you're planted 🌷", 'Your vibe attracts your tribe 🫶',
];

export const SAMPLE_NOTES = [
  'Back-to-back meetings but we nailed the partner pitch!', 'Needed an extra boba today.', 'Lots of emails, but got through them.',
  'Event prep is stressing me out a little.', 'So proud of the team!', 'Slept late, super sleepy.', 'Cozy day, finished tasks early.',
  'Had a small misunderstanding, but we talked it out.', 'Good music made everything better.',
];
