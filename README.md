# 👑 SCS External Princess Mood Checker

A girly, phone-first mood checker and tracker for the SCS External Princess. Vite + vanilla JS, **Supabase** for login and database, ready to deploy on **Vercel**.

- 💖 Check-in: 10 moods, energy / stress / social-battery sliders, mood factors, self-care checklist, diary note
- 📊 Dashboard: streak, today's mood meter, 14-day vibe trend, mood mix, best weekdays, 5-week calendar, insights
- 📖 Royal Diary with search, mood filter and delete
- 👑 Reports: download as HTML, CSV, print/save as PDF, or share from the phone's share sheet
- 🔐 Private login. Each account only ever sees its own entries (Supabase Row Level Security)
- 📱 Phone-first: bottom tab bar, big tap targets, sticky Save button, bottom-sheet popups
- 📴 **Works fully offline** (installable PWA): moods save instantly on the phone and upload by themselves when there's signal

## 1. Set up Supabase (about 5 minutes)

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query**, paste all of `supabase/schema.sql`, click **Run**. (Safe to re-run, and safe if you ran an earlier version of this schema.)
3. **Authentication → Users → Add user → Create new user.** Enter Tina's email and a password, and tick **Auto Confirm User**.
4. **Authentication → Sign In / Providers → Email**: once her account exists, turn **off** "Allow new users to sign up" so nobody else can register.
5. **Project Settings → API**: the **Project URL** and **publishable** key are already filled in `.env.production`. Never use the secret / `service_role` key.

## 2. Deploy: GitHub → Vercel

1. Push this folder to a new GitHub repo (`.env` files are git-ignored, so no keys get uploaded).
2. [vercel.com](https://vercel.com) → **Add New → Project** → import the repo. Vercel detects Vite automatically (build `npm run build`, output `dist`).
3. Your project URL and publishable key are already in `.env.production` (public values, safe to commit), so Vercel needs **no extra setup**. To use a different Supabase project, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **Environment Variables** instead (these override the file). Optional: `VITE_PRINCESS_NAME` (default `Tina`).
   **Never** add the `sb_secret_` key or the `service_role` key anywhere in this project or in Vercel's `VITE_` variables. They bypass Row Level Security and would be public in the browser.
4. Click **Deploy**. If you change a variable later, **Redeploy** (they are baked in at build time).
5. In Supabase **Authentication → URL Configuration**, set **Site URL** to your Vercel URL (and add it under Redirect URLs) so password-reset emails point to the right place.

## 3. On the phone

Open the Vercel URL **once with internet**, log in, then install it: **Share → Add to Home Screen** (iPhone Safari) or the **📲 Install app** button in Reports → Royal Tools (Android Chrome). She stays logged in, and the app opens offline from then on.

New versions you deploy are picked up automatically the next time she opens the app online (never while she's halfway through a check-in).

## How offline mode works

- The whole app is cached on the phone after the first visit, so it opens with **no signal** (airplane mode, no data, anywhere).
- Every change (new mood, delete, restore, etc.) is saved **on the phone first**, so saving never waits on the internet. It's also added to an upload queue.
- When there is a connection, and each time the app is opened or comes back to the front, the queue uploads to Supabase and the latest diary is pulled back down. A small chip at the top shows the state: `☁️ Synced`, `📴 Offline · 2 waiting`, `🔄 Syncing…`. Tap it to sync now.
- Entries still waiting are marked **⏳ waiting to sync** in the diary.
- Uploads are safe to retry: each entry gets its own ID on the phone, so a dropped connection never creates duplicates.
- **She logs in once, and it stays that way.** The login is saved on the phone and is only removed when she taps **Log out**. The app never signs her out because of a bad or missing connection, and it opens offline even if the saved login has expired. When signal returns it renews the login quietly.
- Only if the server itself says "log in again" (for example, after you reset her password) does the login screen reappear. Her offline entries stay safe on the phone and upload right after she logs in.
- **No login is needed while offline.** If the phone is offline and nobody is logged in, the app opens straight into the diary (or tap **Continue offline** on the login screen). Entries save on the phone, and when signal returns a **🔑 Log in to back up** chip appears. As soon as she logs in, those entries are added to her account automatically.
- Logging in is only needed to back up and to see her diary on another device. The very first install still needs internet once to download the app.
- Logging out with entries still waiting shows a warning. Those entries stay on the phone until she logs back in.
- Tip: use **Install app / Add to Home Screen**. Installed apps keep their saved data much more reliably than a browser tab (Safari can clear a tab's data after about a week of not opening it).

## Moving over the old single-file app's data

In the old `.html` app: **Reports → Backup (.json)**. In the new app, log in and go to **Reports → Restore backup**, then pick that file. Restoring the same file twice can create duplicates.

## Run it locally (optional)

```bash
npm install
npm run dev     # uses .env.local (already filled in); also opens on your phone over the same wifi
```

With no `.env.local`, the app runs in **local mode**: no login, data saved only in that browser (handy for trying the design).

## Notes

- The anon key is safe in the browser **because** Row Level Security is on. Keep the policies from `schema.sql`.
- Table: `mood_entries` (`logged_at`, `mood`, `energy`, `stress`, `social`, `tags[]`, `care[]`, `note`, `is_sample`). Adding a new mood in `src/config.js` also needs it added to the `mood` check list in the SQL.
- "Load sample data" adds clearly-marked demo rows; **Remove sample data** deletes only those.
- iPhone: **Print / Save as PDF** is usually the easiest way to keep a report.

## Project layout

```
index.html            page markup (check-in, dashboard, diary, reports, login)
src/main.js           UI + app logic
src/store.js          offline-first store: phone cache + upload queue + Supabase auth (local-mode fallback)
src/config.js         moods, factors, self-care, copy
  (fonts are bundled via @fontsource, no Google Fonts needed, so it looks the same offline)
src/analytics.js      vibe score, stats, insights
src/report.js         HTML report + CSV
src/style.css         all styles (phone-first)
public/               icons
vite.config.js        PWA setup (manifest + service worker via vite-plugin-pwa)
supabase/schema.sql   table + Row Level Security
```
