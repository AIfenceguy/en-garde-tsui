# En Garde v2

Fencing training tracker for Raedyn (B26, Y-14/Cadet) and Kaylan (Y-12/Y-14). Built for Summer Nationals 2026 (Portland, OR · June 27–July 6).

Static HTML + vanilla JS + Supabase. Hosted on GitHub Pages.

---

## Deploy (one-time setup)

### 1. Create the Supabase project

1. Go to <https://supabase.com/dashboard> and create a new project named **`atelier-tsui-prod`**.
2. Pick the region closest to you (`us-west-2 (Oregon)` is a good default).
3. Save the database password somewhere — you won't need it day-to-day, but you can't recover it later.
4. Once the project is provisioned (takes ~2 min), grab two values from **Project Settings → API**:
   - **Project URL** (e.g. `https://xxxxx.supabase.co`)
   - **anon / public key** (the JWT starting `eyJ...`)
5. The anon key is safe to commit — RLS policies in this repo enforce that no one can read another family's data. The `service_role` key is **not** to be committed under any circumstance.

### 2. Run the migrations

In the Supabase dashboard, open **SQL Editor → New query** and run, in order:

1. Paste the contents of `supabase/migrations/0001_init.sql`, run.
2. Paste `supabase/migrations/0002_rls.sql`, run.
3. Paste `supabase/seed/taxonomy.sql`, run. (This seeds the starter topic / drill / tactic taxonomies.)

### 3. Enable Google OAuth

In Supabase: **Authentication → Providers → Google → Enable**. Follow the linked guide to set up an OAuth client in Google Cloud Console; the redirect URI Supabase needs is shown right there.

Add the GitHub Pages URL (`https://aifenceguy.github.io`) and `http://localhost:8000` to **Authentication → URL Configuration → Redirect URLs**.

### 4. Configure the app

Copy the config template and fill it in:

```bash
cp js/lib/config.example.js js/lib/config.js
```

Edit `js/lib/config.js` and paste in the project URL and anon key.

`config.js` is gitignored. The deployed version on GitHub Pages will need the same file pushed via a separate flow (see step 6).

### 5. Local development

This is a static site — no build step. Serve it with anything:

```bash
cd C:\Users\ricky\en-garde-tsui
python -m http.server 8000
# open http://localhost:8000
```

Or VS Code Live Server, or `npx serve`, etc.

### 6. Deploy to GitHub Pages

```bash
cd C:\Users\ricky\en-garde-tsui
git init
git add .
git commit -m "Initial commit: En Garde v2 foundation"
git remote add origin git@github.com:AIfenceguy/en-garde-tsui.git
git push -u origin main
```

Then in GitHub: **Settings → Pages → Source: `main` / root**.

The site will be live at <https://aifenceguy.github.io/en-garde-tsui>.

**Re: `config.js`:** the deployed site needs the URL and anon key. Easiest path: temporarily un-ignore `config.js` for the deploy (the anon key is public-safe). Or set up GitHub Actions later that injects it from a secret. For MVP, just commit it on a separate `gh-pages-deploy` branch.

---

## Day-to-day

- Open the URL on your phone → "Add to Home Screen" → it works as a PWA, including offline.
- Sign in with Google once. Three profiles (Raedyn / Kaylan / Parent) are auto-created on first login.
- Switch profile in the top-left dropdown.
- All logging happens in the same UI for both kids; the styling shifts (Raedyn = deep red accents, Kaylan = gold accents) so they know whose view they're in.

---

## Phase 1 modules

| Module | File | Status |
| --- | --- | --- |
| Auth + profile switcher | `js/lib/auth.js`, `js/lib/profile.js` | ✅ |
| 3.3 Free Fence (bouts) | `js/modules/bouts.js` | ✅ |
| 3.6 Opponents + SWOT + 5W2H | `js/modules/opponents.js` | ✅ |
| 3.4 Physical | `js/modules/physical.js` | ✅ |
| 3.5 Mental | `js/modules/mental.js` | ✅ |
| 3.1 Private lessons | `js/modules/private_lessons.js` | ✅ |
| 3.2 Group lessons | `js/modules/group_lessons.js` | ✅ |
| Tournaments + countdown | `js/modules/tournaments.js` | ✅ |
| v1 data import | `js/modules/import_v1.js` | ✅ |
| Offline / PWA | `service-worker.js`, `manifest.json` | ✅ |

See `ASSUMPTIONS.md` after Phase 1 completion for what was inferred from the brief.

---

## Repo layout

```
en-garde-tsui/
  index.html
  manifest.json
  service-worker.js
  /css/
    style.css
  /js/
    main.js
    /lib/         # supa client, auth, profile, router, db helpers, util
    /modules/     # one per feature module
    /views/       # page-level renderers
  /supabase/
    /migrations/  # 0001_init, 0002_rls
    /seed/        # taxonomy
  README.md
  ASSUMPTIONS.md  # written after Phase 1
```
