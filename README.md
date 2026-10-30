# Simulcast Schedule

Weekly anime schedule for the Guckplan group: shows the episodes each person watches, on the day they're watched,
with buttons for the legal streaming services in Germany.

The planner and ranker links live below the schedule. Owners enter/leave moving mode with
“Edit schedule” above the week; editing access is managed from the footer. Settings contains
display choices, with refresh/backup/shortcuts under “More options”. Catch-up stream links
default on unless explicitly disabled. Single open episodes use one compact card, while
multiple episodes stay grouped chronologically with ✓ at the far right.

The small **?** next to the title opens a quick guide and optional read-only site tour.
The tour highlights visible controls without switching views or changing any list data.
MAL avatars are refreshed from the connected profile, with an initial if unavailable.
In **Edit schedule**, drag the whole show card onto a day to append a 30-minute slot,
or onto another show to share its planned slot. Dropping only prefills the move dialog:
the owner confirms before anything is saved for everyone. Escape cancels a drag. Clicking
the handle still opens the original typed destination controls.
On phones, hold a non-interactive part of a card for 300 ms before dragging; normal swipes
still scroll. Buttons and service links remain clickable. Settings → Fallback links chooses
AniWorld or torrents for the selected people, remembered in this browser and included in
settings backups. Defaults remain torrents for Rei and AniWorld for others. Mixed group
preferences can show both alternatives. Available service buttons always take priority.

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
Week / Catch-up / Non-seasonal; **/** focuses search; **?** opens the shortcut guide (also in
Settings). Navigation shortcuts ignore typing, open menus/dialogs, held keys and browser modifiers.
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
| `index.html` | The whole page |
| `streams-de.json` | Where each Guckplan show streams in Germany (from LiveChart) |
| `tools/build-streams.mjs` | Rebuilds `streams-de.json` (about 7 minutes; must run from Germany) |
| `tools/publish.mjs` | Uploads `index.html`, `streams-de.json` and this README to GitHub |

## Weekly refresh

A Windows scheduled task, **Anime Schedule - German streams**, runs both scripts every Monday at 05:00
(or the next time the PC is on) without opening a window. The output is in `tools/last-run.log`.
It runs on this PC rather than on GitHub because LiveChart shows the streams for the visitor's country,
and GitHub's servers are in the US.

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

## Trying it locally

Open it through a small web server (browsers block `fetch()` from `file://`), for example `npx serve .` in this folder.

In AniWorld mode, AnimeParadise search is also offered as a backup, only when no
regular service is shown. The Index lists AnimeParadise as “No Ads” (checked
2026-10-30 at https://theindex.moe/library/anime); this is the directory's rating,
not a guarantee about future site behavior. Searches use the show's title rather
than guessing a show-page URL.
