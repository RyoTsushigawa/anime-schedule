# Simulcast Schedule

Weekly anime schedule for the Guckplan group: shows the episodes each person watches, on the day they're watched,
with buttons for the legal streaming services in Germany.

The **Misc.** menu between Search and Settings holds the Watch planner, Higher / Lower, Anime Wrapped
and the Piplup/Empoleon Masterset Tracker. **Settings** holds the display choices and **Hilfe**, the
guide (shortcuts at its end); `?` opens it too. Catch-up stream links default on unless disabled.
Single open episodes use one compact card; several stay grouped chronologically with ✓ at the far right.
Paused shows keep a smaller card in their slot. MAL avatars come from the connected profile, with an
initial if unavailable.

**Moving shows** (with the GitHub key in this browser): **Edit** next to the views turns on moving.
Drag a card onto the middle of another show to share its slot, or onto its top or bottom edge to go
before or after; it saves at once for everyone, and **Rückgängig** in the notice undoes it. **Woche** or
**Immer** sets how long a move lasts. On phones, hold the card 300 ms first; normal swipes still scroll.
⇄ types a destination by hand, **Edit** on a day heading rewrites the day as a list, and the Discord icon
turns the day into the message for the server.

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

**Optional two-list sync:** connect both accounts, choose the counterpart under “Keep lists
together”, then enable “Sync both lists”. Only subsequent actions made in this schedule are
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

Keyboard: **← / →** changes weeks in Week view; **T** shows today; **1 / 2 / 3** opens
Week / Catch-up / Non-seasonal; **/** focuses search; **?** opens the guide at its shortcuts.
Navigation shortcuts ignore typing, open menus/dialogs, held keys and browser modifiers.
**Ctrl/Cmd+Z** still undoes the latest AniList change outside text fields and dialogs.

- **The Guckplan** comes live from the group's Google Sheet (tabs named `Guckplan <Winter|Frühling|Sommer|Herbst> <Year>`).
  The page only reads the sheet, never writes to it. Each episode uses the tab its air date belongs to.
- **Airing times** come live from AniList.
- **AniList outage fallback:** use the browser's last saved week first; without one, use the site's
  independently updated LiveChart release records and the Guckplan. Unconfirmed episodes keep their
  watch day and stream links, labelled “Episode not confirmed”, without an episode tick. A visible
  notice identifies the fallback and its update time. No weekly dates or episode numbers are guessed.
  Daily LiveChart runs retain observed releases for six weeks; existing installations begin with the
  next-episode data already present. Catch-up uses its saved AniList list when available; progress
  changes and first-time list downloads still require AniList.
- **German streams** come from LiveChart.me and are saved in `streams-de.json` once a week, together with
  release times on our services, each show's next episode and recent break/delay headlines.
- Shows without an episode that week appear as **Pause** (back date + announcement) when LiveChart has a
  later episode; older shows in the plan that AniList lists as finished appear as **Rewatch** in their slot.
- **Catch-up** view: everything on an AniList "Watching" list with episodes out but not yet watched.
- **Connect AniList** (optional, per browser): the ✓ next to an episode sets your AniList progress. Uses the
  AniList API client 54702 (redirect URL `https://ryotsushigawa.github.io/anime-schedule/`); the login key
  only stays in that browser, so it only works on the live page, not a local copy. Several accounts can be
  kept in one browser (shared PC): the account menu in the header switches between them, adds one or logs out.
- Each day is sorted by watch time (the sheet's "Uhrzeit", otherwise 19:00, 19:30, …); times before 06:00
  count as that night.

## Files

| File | What it is |
|---|---|
| `index.html`, `style.css` | The page and its look |
| `app.js`, `common.js`, `mal.js`, `early.js`, `drag-moves.js` | The page's scripts (schedule, shared helpers, MyAnimeList, first paint, dragging) |
| `sw.js` | Offline copy for the home-screen app; its `CACHE` name changes with every published version |
| `planner.html`, `planner.js`, `xlsx.js` | Watch planner |
| `wrapped.*`, `wrapped-profiles.json` | Anime Wrapped |
| `streams-de.json` | Where each Guckplan show streams in Germany (from LiveChart) |
| `seasons.json`, `fallback-links.json` | Season index and the alternative show links (daily GitHub run) |
| `moves.json` | Moves, delays and kept delay reasons (only on GitHub, written by the page and the delay helper) |
| `tools/build-streams.mjs` | Rebuilds `streams-de.json` (about 7 minutes; must run from Germany) |
| `tools/publish.mjs` | Runs the tests, then uploads the changed files to GitHub |
| `tools/delays-worker.js` | The Cloudflare helper that saves delays for everyone |
| `tools/delay-check.mjs` | Weekly, read-only: the helper answers, refuses strangers and is the current version |
| `tabs.json`, `tools/tab-list.mjs` | The Guckplan's tab list for first visits (names and tab numbers only), written on publish |
| `tests/` | The page clicked through in a simulated browser (`node --test` there) |

## Weekly refresh

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

## Verspätungen für alle (one time)

With the GitHub key, "Verspätung" on today's heading saves straight to `moves.json`. For everyone else
a small helper on Cloudflare saves it: it holds its own GitHub token and only changes the delays.

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
  New Webhook → Copy Webhook URL). Every saved, changed or removed Verspätung is posted there as one line,
  without pings. With the helper set up, the key holder's delays go through it too, so they're posted as well.
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

Open **Misc. → Anime Wrapped**. In the final seven calendar days of March, June,
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
