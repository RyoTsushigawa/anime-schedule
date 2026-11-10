# Simulcast Schedule

Weekly anime schedule for the Guckplan group: shows the episodes each person watches, on the day they're watched,
with buttons for the legal streaming services in Germany.

## Hand-over: read this first (state on 10 Nov 2026)

This project has been worked on in several chats and with several assistants. Each one only knew its own
part, so this section says what runs where and what is still open. Keep it up to date when that changes.

**What runs where**

| Where | What | Notes |
|---|---|---|
| GitHub (this repository, branch `main`) | The site itself (GitHub Pages), `moves.json` and `nicknames.json` written by the page | The copy here is the current one. Changes go in through pull requests. |
| GitHub Actions | `discord-daily.yml` (daily Discord post), `daily-status.yml` (LiveChart status), `source-health.yml`, `masterset-prices.yml` | GitHub's own timer runs hours late or skips days. The daily post is therefore started from Cloudflare. |
| Cloudflare Worker `schedule-delays` | Saves delays and absences for everyone, posts them to Discord, and starts the daily post at 08:50 German time (cron `50 6,7 * * *`) | Deployed: **v13** (checked 10 Nov), cron trigger set. Its code is **not** in this repository (see below). |
| The owner's PC | `tools/build-streams.mjs` (must run from Germany), `tools/publish.mjs` and the weekly checks, with the tokens | These tools exist only on the PC. Since 10 Nov `publish.mjs` uploads data only (see below). |
| Discord bot (separate zip, v7) | `/delay`, `/abwesend` and status | Not in this repository. Whether v7 is installed is unconfirmed. |

**Things that bite**

- `tools/publish.mjs` on the PC was changed on 10 Nov: it uploads only data (`streams-de.json`, `seasons.json`,
  `fallback-links.json`, `tabs.json`, `config.json`) and first fetches the build tools from GitHub. It no
  longer uploads the page's code. `--code` is the old behaviour and overwrites GitHub's page files: don't use it
  unless the PC's files are known to be newer.
- The PC holds the original, commented page source; what is on GitHub is the version stripped of comments
  (`tools/slim.mjs`), and all work since 9 Nov was done on that. The PC's page files are out of date: an archive,
  not a source to publish from.
- Some tools exist only on the PC (marked **PC only** under "Files"), among them the helper's code
  (`delays-worker.js`). The PC's weekly check flags unexpected files in this repository, so the helper code
  was deliberately not added here. Nobody working from GitHub alone has seen the PC tools: what this README
  says about them comes from earlier sessions and was not re-checked on 10 Nov.
- Every change to the site needs a new `CACHE` name in `sw.js`, or visitors keep the old version.
- The sandbox of a cloud chat cannot load the site's data (Google Sheet, AniList, github.io). Real-data
  checks were done with a temporary workflow on a branch, removed again afterwards.
- A parallel session may edit the same files: fetch `main` before every change.

**Done on 9–10 Nov 2026** (pull requests #1–#28)

Daily Discord post with weekday role ping, nicknames, emotes and the "Fällt aus" list (Skip / Recap /
Pause); absence calendar with "ab"/"bis" times; Doppelt and the new Lang (two slots, "(x2)" in the post);
LiveChart "double-length" notes; partial absences checked at the real watch time; Recap weeks detected;
icon buttons on the day heading; regrouped move dialog; pause rows with reason tags; help sections and
patch notes; this README brought in line with the site.

**Still open**

- 11 Nov: first morning with the Cloudflare timer. Expected: a rehearsal run under Actions shortly after
  07:50 German time (posts nothing) and the real post at 09:00. A refused start is reported in the bot test
  channel with a ping.
- Repository secret `DISCORD_WEBHOOK_LOGS` was added by the owner on 10 Nov (cannot be verified from a
  chat); the failure step that uses it has never fired.
- Whether bot v7 (`/abwesend`) is installed is unconfirmed.
- The PC's weekly `live-check.mjs` may report `tools/discord-daily.mjs` and
  `.github/workflows/discord-daily.yml` as unexpected files; they belong here.
- Known limits: a long finale is only recognised once AniList knows the episode count; a "double-length
  premiere" is matched to episode 1 (a Part 2 that keeps counting needs **Lang** by hand).

**House rules the owner has set**

Keep everything as short and clean as possible. Desktop first, phones are not a priority. No countdowns,
no calendar subscriptions, no dots for watchers, no text labels on day headings, no `/spitzname` bot
command. Dark theme is the default. "Edit" stays "Edit". Patch notes are in English. Warnings go to the
bot test channel with a ping for the owner (Discord user `255387990136848385`), never to the schedule channel.

The **Tools** menu between Search and Settings holds the Watch planner, Higher / Lower, Anime Wrapped
and the Piplup/Empoleon Masterset Tracker. **Settings** holds the display choices and **Hilfe**, the
guide (shortcuts at its end); `?` opens it too. Catch-up stream links default on unless disabled.
Single open episodes use one compact card; several stay grouped chronologically with ✓ at the far right.
Paused shows keep a smaller card in their slot. MAL avatars come from the connected profile, with an
initial if unavailable.

**Moving shows** (with the GitHub key in this browser): **Edit** in the top row turns on moving.
Drag a card onto the middle of another show to share its slot, or onto its top or bottom edge to go
before or after; it saves at once for everyone, and **Rückgängig** in the notice undoes it. **Diese Woche** or
**Dauerhaft** sets how long a move lasts. On phones, hold the card 300 ms first; normal swipes still scroll.
⇄ opens the move dialog for one show: day and time, **Diese Woche / Dauerhaft**, **Doppelt** (last week's
episode comes along) or **Lang** (an overlong episode); both take two slots, so later shows move back
30 minutes, and both only apply to the current week. **Skip** drops the show for the week. The pencil on a
day heading rewrites the day as a list, and the Discord icon turns the day into the message for the server.

**Long episodes** are also found by themselves: LiveChart's card note ("Double-length premiere", or a note
about a long finale) and timetable notes ("one-hour special") are stored by the daily build as `long` in
`streams-de.json`. Two episodes that merely air in the same week are *not* treated as a double.

**Abwesenheiten:** the calendar button in the top bar (or "Abwesend" on a day) opens a month calendar.
Tap a day, or a first and last day for a range, pick the people, and choose the whole day, "Ab …" (away
from that time on) or "Bis …" (there only from that time). A show is set out when at most one person is
left at the time it is really watched (after delays and long episodes); the schedule, the Discord message
and the 9:00 post all follow it. On a show that still runs, absent watchers' names are struck through.
Absences can also repeat weekly (12 weeks). Saved in `moves.json` (`absent`); everyone can enter them, without
the GitHub key through the Cloudflare helper (v9 or later).

**Verspätung:** the clock on today's heading adds a delay from one show on; it and every later show move,
and delays add up. **Edit** on the delay line changes or removes it. Everyone can add one (see
"Verspätungen für alle"); other open pages pick it up within 30 seconds.

**Ersatz-Links** (Settings) choose AniWorld or torrents for the selected people when no service shows,
and Prime or torrents for Prime shows; remembered in this browser. Defaults are torrents for Rei and
AniWorld for the others. Mixed groups can show both. Available service buttons always take priority.

**MyAnimeList accounts:** open the account menu → Connect MyAnimeList. The Cloudflare helper
(`https://anime-schedule-mal.shigeruhagano.workers.dev`) handles OAuth and keeps MAL credentials
off GitHub. MAL accounts support Week/Catch-up/Non-seasonal, ✓, Drop, whole-number scores and Undo.
ID mappings come from AniList `idMal` and the LiveChart season index, never guessed titles.
Native MAL metadata and saved mappings remain usable if AniList is down.

**Optional two-list sync:** connect both accounts, choose the counterpart under **Listen-Sync**
in the account menu, then switch **An** on. Only subsequent actions made in this schedule are
mirrored; no existing list is imported or overwritten. Pairing is explicit and per browser,
including when names differ. Undo restores each provider's exact original values. Scores
convert between scales (MAL uses whole numbers). Partial failures are shown; a partner that
is already further ahead is not reduced when marking an earlier episode watched.
The ranker's separate AniList writes are not included in this schedule-specific pairing.

- **Alternative show links:** refreshed automatically with the daily LiveChart job in
  `fallback-links.json`. Everyone keeps their normal services. Only with no visible service does
  Rei get a verified SubsPlease show page when matched, otherwise a Nyaa title search. Other viewers get
  a verified AniWorld series page, or an explicitly labelled AniWorld search. Mixed groups use
  the actual viewers of each show. No guessed show slugs or episode download URLs are generated.
- **Schedule notices:** collapsed by default; confirmed breaks and unconfirmed schedules are
  counted separately. Explicit `FINISHED` media status suppresses end-of-run warnings; an empty
  next-episode date alone does not mean finished. Recent season finishes are not treated as rewatches.

Keyboard: **← / →** changes weeks in Week view; **T** shows today; **V** adds a delay for today;
**G** switches Solo / Gruppe; **1 / 2 / 3** opens Week / Catch-up / Non-seasonal; **/** focuses search; **?** opens the guide at its shortcuts.
Navigation shortcuts ignore typing, open menus/dialogs, held keys and browser modifiers.
**Ctrl/Cmd+Z** still undoes the latest AniList change outside text fields and dialogs.

- **The Guckplan** comes live from the group's Google Sheet (tabs named `Guckplan <Winter|Frühling|Sommer|Herbst> <Year>`).
  The page only reads the sheet, never writes to it. Each episode uses the tab its air date belongs to.
- **Airing times** come live from AniList.
- **AniList outage fallback:** use the browser's last saved week first; without one, use the site's
  independently updated LiveChart release records and the Guckplan. Unconfirmed episodes keep their
  watch day and stream links, labelled “Folge nicht bestätigt”, without an episode tick. A visible
  notice identifies the fallback and its update time. No weekly dates or episode numbers are guessed.
  Daily LiveChart runs retain observed releases for six weeks; existing installations begin with the
  next-episode data already present. Catch-up uses its saved AniList list when available; progress
  changes and first-time list downloads still require AniList.
- **German streams** come from LiveChart.me and are saved in `streams-de.json` once a week, together with
  release times on our services, each show's next episode and recent break/delay headlines.
- Shows without an episode that week appear as a **Pause** row (back date + announcement) when LiveChart has a
  later episode; a recap week gets the tag **Recap**, a skipped show **Skip**, a show set out by absences
  **Abwesend**. The arrow icon on the day heading ("Pause überspringen") decides whether later shows move up
  into the free slot; older shows in the plan that AniList lists as finished appear as **Rewatch** in their slot.
- **Catch-up** view: everything on an AniList "Watching" list with episodes out but not yet watched.
- **Connect AniList** (optional, per browser): the ✓ next to an episode sets your AniList progress. Uses the
  AniList API client 54702 (redirect URL `https://ryotsushigawa.github.io/anime-schedule/`); the login key
  only stays in that browser, so it only works on the live page, not a local copy. Several accounts can be
  kept in one browser (shared PC): the account menu in the header switches between them, adds one or logs out.
- Each day is sorted by watch time (the sheet's "Uhrzeit", otherwise 19:00, 19:30, …); times before 06:00
  count as that night.

## Files

Rows marked **PC only** are not in this repository: they exist only in the owner's folder on the PC.

| File | What it is |
|---|---|
| `.github/workflows/` | GitHub runs: `discord-daily.yml` (daily Discord post), `daily-status.yml` (LiveChart status and alternative links), `source-health.yml` (AniWorld reachable?), `masterset-prices.yml` |
| `index.html`, `style.css` | The page and its look |
| `app.js`, `common.js`, `mal.js`, `early.js`, `drag-moves.js` | The page's scripts (schedule, shared helpers, MyAnimeList, first paint, dragging) |
| `sw.js` | Offline copy for the home-screen app; its `CACHE` name changes with every published version |
| `planner.html`, `planner.js`, `xlsx.js` | Watch planner |
| `wrapped.*`, `wrapped-profiles.json` | Anime Wrapped |
| `streams-de.json` | Where each Guckplan show streams in Germany (from LiveChart) |
| `seasons.json`, `fallback-links.json` | Season index and the alternative show links (daily GitHub run) |
| `nicknames.json` | Short show names for the Discord message (written from the Discord dialog) |
| `moves.json` | Moves, delays and kept delay reasons (only on GitHub, written by the page and the delay helper) |
| `tools/build-streams.mjs` | Rebuilds `streams-de.json` (about 7 minutes; must run from Germany); the daily GitHub run uses it for the status part only |
| `tools/livechart-pages.mjs`, `tools/fallback-links.mjs`, `tools/check-sources.mjs` | Reading LiveChart's pages; the alternative show links; the AniWorld check |
| `tools/publish.mjs` | **PC only.** Runs the tests and the secret guard, then uploads the changed files to GitHub |
| `tools/secret-scan.mjs` | **PC only.** The secret guard: stops a publish or a bot zip that contains a GitHub key, Discord webhook address or bot token |
| `tools/mal-check.mjs` | **PC only.** Weekly, read-only: the MyAnimeList helper answers, asks for a login, turns strangers away and is the current version |
| `tools/key-check.mjs` | **PC only.** Weekly, read-only: warns three weeks before the publish key (`tools/github-token.txt`) runs out |
| `tools/weekly-alert.mjs` | **PC only.** End of the weekly run: anything that needs a look goes to the bot test channel through the webhook in `tools/alert-webhook.txt` (this PC only; `--test` sends one test line) |
| `tools/live-check.mjs` | **PC only.** Weekly, read-only: every live page keeps its security rules, no key and no unexpected file is in the repo, GitHub Pages shows the latest upload |
| `tools/discord-daily.mjs` | Posts today's schedule to Discord every day at 09:00 (GitHub run `discord-daily.yml`, started by the Cloudflare helper, see below) |
| `tools/delays-worker.js` | **PC only.** The Cloudflare helper: saves delays and absences for everyone and starts the daily Discord post |
| `tools/delay-check.mjs` | **PC only.** Weekly, read-only: the helper answers, refuses strangers and is the current version |
| `tabs.json`, `tools/tab-list.mjs` | (`tab-list.mjs` is **PC only**.) The Guckplan's tab list for first visits (names and tab numbers only), written on publish |
| `tests/` | **PC only.** The page clicked through in a simulated browser (`node --test` there) |

## Weekly refresh

(Everything in this section runs on the owner's PC with tools that are **PC only**.)

A Windows scheduled task, **Anime Schedule - German streams**, runs both scripts every Monday at 05:00
(or the next time the PC is on) without opening a window. The output is in `tools/last-run.log`.
It runs on this PC rather than on GitHub because LiveChart shows the streams for the visitor's country,
and GitHub's servers are in the US.

**Titles:** where LiveChart writes a show's title with the same letters but more cleanly ("TANK CHAIR" →
"Tank Chair"), the page uses LiveChart's by itself. Word changes ("KERORO☆" → "Keroro Gunsou☆") go into
`TITLE_FIXES` in `common.js` by hand. The weekly run's title check (`tools/title-check.mjs`) lists
candidates in `tools/last-run.log` as `check:` lines; a title that's fine as it is goes into `TITLE_KEEP`.

## Putting it online (one time)

1. On GitHub, create a new **public** repository named `anime-schedule` (leave it empty).
2. Create a token at **GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token**:
   - Repository access: **Only select repositories** → `anime-schedule`
   - Permissions → Repository permissions → **Contents: Read and write**
   - Pick a long expiration (you'll need a new token when it runs out).
3. Paste the token into a new file `tools/github-token.txt`. It stays on this PC and is never uploaded.
4. Upload everything once: in Windows' Task Scheduler, right-click **Anime Schedule - German streams** → **Run**,
   or run `node tools/build-streams.mjs` and then `node tools/publish.mjs` in this folder.
5. In the repository: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
6. After a minute the page is at `https://ryotsushigawa.github.io/anime-schedule/`.

Changes to the page made on this PC are uploaded by the next weekly run, or right away with `node tools/publish.mjs`.
**Careful:** the site is now also changed directly on GitHub (pull requests). Bring the PC folder up to date
with `main` before publishing, or the PC's older files overwrite the newer ones.

## Verspätungen für alle (one time)

With the GitHub key, "Verspätung" on today's heading saves straight to `moves.json`. For everyone else
a small helper on Cloudflare saves it: it holds its own GitHub token and only changes the delays and absences.
The same helper starts the daily Discord post (see "Täglich auf Discord").

1. Make a free account at <https://dash.cloudflare.com>, then **Workers & Pages → Create → Worker**.
   Name it e.g. `schedule-delays`, **Deploy**, then **Edit code**: replace everything with
   `tools/delays-worker.js` and **Deploy** again.
2. On GitHub make a fine-grained token (Settings → Developer settings → Fine-grained tokens):
   only the repository `anime-schedule`, permission **Contents: Read and write**.
3. In the Worker: **Settings → Variables and Secrets → Add**, type **Secret**, name `GITHUB_TOKEN`,
   the token as value.
4. Put the Worker's address (e.g. `https://schedule-delays.<name>.workers.dev/`) into
   `tools/delays-url.txt` and run `node tools/publish.mjs`. From then on everyone gets the button.

Optional, both as **Secret** in the Worker's Variables and Secrets:

- `DISCORD_WEBHOOK`: a channel's webhook address (Discord: channel settings → Integrations → Webhooks →
  New Webhook → Copy Webhook URL). Every saved, changed or removed Verspätung or absence is posted there as one line,
  without pings: how many minutes, from which show on. The reason only shows on the site. With the helper set up, the key holder's delays go through it too, so they're posted as well.
- `DISCORD_TEST_WEBHOOK`: the bot test channel's webhook. `node tools/delay-e2e.mjs` checks the whole path
  once (a test delay a week ahead, in and out again); its two lines go only there, never into the real
  channel, and without this secret they aren't posted at all.
- `BOT_KEY`: a long random password (16+ characters, 32+ is better). The Discord bot signs its `/delay` requests with it (the key itself never travels); the bot's
  `.env` needs the same value as `DELAYS_KEY`, plus `DELAYS_URL` = the Worker's address.

Safety: the helper takes no links in titles or reasons (they'd land in Discord), nothing over 4 KB,
and at most 30 changes in 10 minutes from one address (the bot is exempt). The weekly run's
`tools/delay-check.mjs` says when the code on Cloudflare is older than `tools/delays-worker.js`.

Each delay stores its planned start (`at`, "20:00"); the bot's status shifts its times by it. Delays
from the bot are stored by time (`show: "@20:00"`) and count from the first show at or after it.

## Täglich auf Discord (one time)

Every day at 09:00 German time a GitHub run (`.github/workflows/discord-daily.yml`) posts today's
schedule to a Discord channel: the same text the Discord button on a day heading gives, built by the
live page itself in a headless browser (moves, delays and pings included).

1. Discord: channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.
2. GitHub: repository **Settings → Secrets and variables → Actions → New repository secret**, name
   `DISCORD_WEBHOOK_SCHEDULE`, the webhook address as value. Without it the run posts nothing.
3. Try it: **Actions → Daily Discord schedule → Run workflow**. "dry run" ticked only shows the message
   in the log; unticked posts it right away.

**Spitznamen:** the Discord button's dialog has a **Spitznamen** section: a short name per show for the
Discord message (the button and the daily post), saved for everyone in `nicknames.json` with the GitHub key.
The site itself keeps the full titles.
Emojis can go straight into a nickname. Server emotes need Discord's full code once (in Discord type
`\:emote:` and send it; the message shows `<:emote:123…>`): paste that into a nickname and save, and from
then on `:emote:` is enough in any nickname. Known emotes are kept in `nicknames.json` under `emotes`.

**If it fails:** a run that breaks writes a warning with a ping into the logs channel. For that, add the
logs channel's webhook as the repository secret `DISCORD_WEBHOOK_LOGS` (same place as in step 2). If the
helper can't start the run at all, it warns in its `DISCORD_TEST_WEBHOOK` channel (with the ping from v13 on).

**Start at 08:50:** GitHub's own timer starts runs hours late or not at all, so the Cloudflare helper
from "Verspätungen für alle" starts this run (the run then waits for 09:00):

4. GitHub: the helper's token (Settings → Developer settings → Fine-grained tokens) already has
   **Contents: Read and write**; that is all it needs.
5. Cloudflare: the Worker → **Settings → Trigger events → Add → Cron Triggers**, enter `50 6,7 * * *`
   and save. (Cloudflare counts in UTC: one of the two is 08:50 in Germany, summer or winter. Helper v10
   ignores the other one; from v11 on it starts a rehearsal, a run that only writes the message into its log.)
   To test at any time (helper v11 or later): add a second cron trigger a few minutes ahead (e.g. `*/5 * * * *`),
   wait for a "Daily Discord schedule" run under Actions (it posts nothing), then remove that trigger again.

## Trying it locally

Open it through a small web server (browsers block `fetch()` from `file://`), for example `npx serve .` in this folder.

0neko is an outage-only replacement for AniWorld, opening the show's AniList ID
at `https://0neko.cc/#/anime/ID`. The source-health workflow checks every 30 minutes
(GitHub may delay scheduled runs). Two failed requests are required; blocked or
unrecognised responses are unknown. Only a confirmed outage checked within 90
minutes changes the button. Legal services and torrent preferences take priority.

## Anime Wrapped

Herbst 2026 uses only Guckplan data: no AniList/MAL list reads, even with linked
profiles or when refreshing. List statistics and profile linking start with Winter
2027. Group and individual stories differ; MaRyo is two people sharing one plan.
The shared plan is never doubled when counting shows or slots.

Open **Tools → Anime Wrapped**. In the final seven calendar days of March, June,
September and December (Berlin time), a prominent Wrapped banner also appears above
the schedule. Choose the season and any visible plan
person, or the whole group. Story cards show planned series, weekly slots, the
busiest day, shared watch partners, popular shows and parallel slots. Plan time is
estimated at 30 minutes per slot, not actual watched time. Hidden rows and columns
follow the same rules as the schedule. The source is that season's current
Guckplan snapshot, not a historical event log or temporary weekly moves.

**Profile** maps one or more public AniList names or locally connected MAL accounts
to a plan person. Names are not inferred; MaRyo's already-known RyoTsushigawa
identity is the only default. Mappings are local to this browser. Group totals
read each account once and disclose how many plan people have been linked.
Completions require a complete list completion date within the selected season;
genres and favourites use those records. Approximate runtime is explicitly not
watchtime during the season. Missing data is not treated as zero across the group.
List snapshots are cached for an hour, refreshable with ↻; stale fallback is labelled.
Extra cards show niche picks, latest planned slots, plan-size comparisons, season
ratings, completion-date peaks and group rating disagreements. Delays are excluded.
Use **Karte speichern** to download the visible card as a PNG; nothing is posted.

Shared Wrapped identities live in wrapped-profiles.json, using the owner-provided
AniList names. MaRyo links RyoTsushigawa and MilkyWay95. Personal browser overrides
remain possible; no accounts are fetched for Herbst 2026.
