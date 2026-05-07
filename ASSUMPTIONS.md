# Phase 1 Assumptions

Living doc — Claude Code appends here whenever it makes a call that wasn't explicitly answered in the brief or the kickoff Q&A. Reviewed at Phase 1 ship.

## Confirmed up-front (May 2026)

- **Repo location:** `C:\Users\ricky\atelier-tsui\` (sibling to `foiliq-pipeline`).
- **Supabase:** new project `atelier-tsui-prod`, not a schema in `tlaps-prod`.
- **Auth model:** single family Google account; three profiles (raedyn / kaylan / parent) FK'd to that auth user. Privacy boundary lives at UI + RLS query layer.
- **Stack:** vanilla JS, Supabase JS client from CDN (esm.sh), no build step.
- **Hosting:** `aifenceguy.github.io/atelier-tsui`.
- **Auto-taper / Osgood-Schlatter:** advisory UI nudges only. Warning text says "talk to your doctor or coach," never prescribes.

## In-flight decisions (logged as Claude makes them)

### A1 — Service worker scope
**Decision:** SW caches the static app shell only. Supabase API requests are explicitly bypassed and go to network (or fail and trigger the offline-write queue). The `Cache-First with revalidate` pattern is used for shell files.
**Why simpler:** A full read-cache layer for Supabase responses would need invalidation logic per table and would burn more time than it saves for Phase 1 — bad-wifi venues are mainly a *write* problem (logging bouts mid-tournament), not a read problem.
**If it bites us:** Read-mode at venues will fail. We add a read cache in Phase 2.

### A2 — Offline write queue
**Decision:** All mutations go through `safeWrite()` in `js/lib/offline.js`. When offline (or fetch fails), the call enqueues to IndexedDB. On `online` event, queue drains in insert order, stops on first error to preserve causality.
**Why simpler:** No conflict resolution, no per-row versioning. The two kids almost never edit the same record simultaneously, and even if they do, last-write-wins is acceptable for a personal log.
**If it bites us:** A queue entry that fails server-side validation blocks the queue. UI surfaces this as a persistent "unsynced changes" indicator and lets the user inspect/clear the queue (Phase 2).

### A3 — Bottom nav grouping
**Decision:** Six tabs in the bottom nav: Today (dashboard), Bouts, Scout (opponents), Body (physical), Mind (mental), Lessons. The Lessons tab covers BOTH private and group lessons via internal sub-tabs, since both are low-frequency logging.
**Why simpler:** Six bottom-nav slots is the practical max on mobile. Splitting Lessons into two tabs would push Tournaments off the nav entirely; merging is the lighter touch.
**If it bites us:** Either kid finds the sub-tab annoying; we promote group/private to top-level in Phase 2.

### A4 — Profile-creation defaults
**Decision:** On first sign-in, the app auto-creates three profile rows: Raedyn (b. 2012, foil, deep-red accent), Kaylan (b. 2014, foil, gold accent), Parent. These can be edited from a Settings view (Phase 1.5 if not in MVP).
**Why simpler:** Brief is for THIS family; no need for a generic onboarding wizard.
**If it bites us:** None expected for the named users.

### A5 — Magic-link fallback for sign-in
**Decision:** Sign-in screen offers Google primarily, with a magic-link fallback on a "trouble signing in?" affordance. Both go through the same Supabase Auth instance.
**Why simpler:** Brief asked for both; magic link is one extra `signInWithOtp` call.

### A6 — Taxonomies are global, not per-profile
**Decision:** `topic_taxonomy`, `drill_taxonomy`, `tactic_taxonomy` are seeded globally and shared across all profiles. Custom additions are also visible to all profiles in the family.
**Why simpler:** Avoids profile_id-scoping every chip render. The cost (Raedyn sees a custom drill Kaylan added) is benign.
**If it bites us:** Add a `profile_id` column to taxonomy tables in Phase 2 with a RLS scope.

### A7 — Bout entry: opponent is free-text first
**Decision:** When logging a bout, the opponent field is a free-text input with autocomplete against the existing `opponents` table for that profile. On save, if no matching opponent record exists, one is auto-created with just the name. The user can later enrich the opponent record from the Scout tab.
**Why simpler:** Fast bout entry (the §8 success criterion is "logging takes < 90 seconds"). Forcing the user into an "add opponent" flow before logging a bout would blow that budget.
**If it bites us:** Opponent records get spelling variants ("Sam J." vs "Sam Johnson"). The Scout tab gets a "merge duplicates" affordance in Phase 2.

### A8 — SWOT auto-update from bouts
**Decision:** Per the brief, a bout's `failure_patterns` and `scoring_actions` should "auto-create or update" the opponent's SWOT. Phase 1 implementation: on bout save, the bout's failure patterns are *suggested* as Threats and the bout's successful scoring actions are *suggested* as Opportunities. The user clicks "Apply suggestions" on the opponent's SWOT page to accept; nothing is auto-merged silently.
**Why simpler/safer:** Silent SWOT mutation could erase user-curated language. A suggestion + apply flow keeps the kid in the loop.
**If it bites us:** Kids don't bother clicking "Apply" → SWOTs stay sparse. We monitor adoption and consider auto-merge in Phase 2 if it's a problem.

### A9 — Tournament countdown & taper detection
**Decision:** Countdown chip in the topbar shows the next tournament for the active profile. When `daysUntil(tournament) <= 5 && >= 0`, the chip turns warning-yellow and the Physical module surfaces a taper nudge (advisory only, doesn't block logging at full volume).
**Why simpler:** The taper "auto-protocol" in §3.4 is described as a content recommendation, not a hard rule. Showing the recommendation and letting the kid follow it (with coach input) is the safer move for minors.

### A10 — Knee-pain (Osgood-Schlatter) detection
**Decision:** A nudge surfaces if the user has logged `injury_flag=true` with a soreness_location matching `/knee/i` 3+ times in the last 14 days. Nudge text says "Knee pain has come up a few times — talk to your doctor or coach about volume." No automatic blocking, no recommendation of specific treatment.
**Why safer:** Anything stronger crosses into clinical advice for a minor. Per Ricky's instruction, advisory only.

### A11 — Per-day uniqueness on physical_sessions and mental_sessions
**Decision:** Schema enforces `unique (profile_id, date)` on `physical_sessions` and `mental_sessions`. The UI for these modules uses upsert semantics — re-opening today's session lets you edit, not duplicate.
**Why simpler:** Daily check-in pattern is one-row-per-day. Multi-row-per-day would be over-engineered for the use case.
**If it bites us:** A kid wants to log AM and PM separately. We add a `slot` column ('am'|'pm') and relax the unique in Phase 2.

### A12 — Bouts are NOT unique-per-day
**Decision:** No uniqueness constraint on `bouts.date` — multiple bouts per day is the common case (open fencing nights, tournament pools).

### A13 — `created_by` taxonomy column is nullable
**Decision:** Seeded taxonomy rows have `created_by = null`. The RLS policy allows insert when `created_by is null` (covers seed scripts) OR when the inserting user owns that profile.
**Note:** Means an authenticated user could in theory insert rows with `created_by=null` and they'd be globally visible. Acceptable trade-off for MVP given there are only 3 profiles in this entire database.

### A14 — Number of past `bouts` rendered on first load
**Decision:** The Bouts list view paginates client-side, showing the most recent 30 bouts and a "load more" button. Server-side pagination via `range()` will be added if/when the list crosses ~200 rows.

### A15 — Tournament seed data
**Decision:** No tournaments are seeded in the migration. Summer Nationals 2026 (June 27–July 6, Portland OR) is documented in the README and the user can add it from the Tournaments view on first run. Seeding it for the wrong profile would be presumptuous.

### A16 — v1 import data shape
**Decision:** v1 stored data in `localStorage` under key `tsui_brothers_log_v1` with shape `{ raedyn: { bouts[], instincts[], sessions[] }, kaylan: { bouts[], ratings[], sessions[] } }`. Per the brief §10. The import view accepts a JSON paste and maps fields per that contract. If actual v1 export format differs, the importer logs the unknown fields and skips them rather than failing.
**Why safer:** Log-and-skip beats abort-on-mismatch when the user is migrating real data.

### A17 — No coach-share URL in Phase 1
**Decision:** §4.7 explicitly marks coach-share as Phase 2. Not building.

### A18 — No pattern-detection analytics in Phase 1
**Decision:** §3.6's "pattern detection across opponents" is explicitly Phase 2 in the brief. Not building. Phase 1 ships SWOT capture and a basic per-opponent record view.

### A19 — Seed Summer Nationals 2026 milestone copy on dashboard
**Decision:** Dashboard prominently features "Summer Nationals · {{N}} days" countdown when no tournament is in the user's table for the current profile, suggesting the user add it. (Information-only — clicks through to the tournaments form.)

### A20 — `git init` is local-only
**Decision:** Claude runs `git init` and creates per-module commits locally. Pushing to GitHub (`AIfenceguy/atelier-tsui`) requires Ricky's gh auth + remote creation; README walks through it.
