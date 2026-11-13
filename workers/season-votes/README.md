# Season Preview group voting Worker

Season Preview voting is designed for a small friend group. **No AniList login or account mapping is needed.** One shared private group code unlocks voting for the current browser session, after which friends select any existing group member column. This is intentionally **not an individual identity system**: anyone with the code may cast or change any group member's vote.

## Setup

Google blocks key files for service accounts by default, so the Worker writes as the **sheet owner** through their own
Google login (the same OAuth client as the trailer playlists, but a separate key that may only use Google Sheets).

1. Google Cloud (the trailer playlist project): **APIs & Services → Library → Google Sheets API → Enable**.
2. On the PC in `tools`: `node youtube-login.mjs --sheets`, log in with the account that owns the Guckplan sheet.
   It saves `tools/sheets-refresh-token.txt` (PC only, never uploaded or pasted anywhere).
3. GitHub **Actions** secrets: `SEASON_GOOGLE_REFRESH_TOKEN` (that file's line), `SEASON_SHEET_ID`,
   `CLOUDFLARE_API_TOKEN`
   (template "Edit Cloudflare Workers") and `CLOUDFLARE_ACCOUNT_ID`. `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET` are
   reused. (A service account still works where allowed: `SEASON_GOOGLE_SERVICE_ACCOUNT_EMAIL` + `SEASON_GOOGLE_PRIVATE_KEY`.)
4. Run the manual GitHub Actions workflow **Deploy Season Preview voting Worker**.
5. Add the Worker's URL as `previewVotesUrl` in `config.json`; the voting bar then appears on the Season Preview.
6. Choose a name, vote. Voting is open (the owner's choice); an optional `SEASON_GROUP_ACCESS_CODE` (16+ random
   characters) would ask for a shared code once per browser session.

## What the Worker enforces

- `GET /access` checks the private code in the `X-Group-Code` header. `POST /vote` verifies the code on **every** request.
- Only the existing spreadsheet and its standalone `Winter YYYY`, `Frühling YYYY`, `Sommer YYYY`, or `Herbst YYYY` tabs are writable. Active `Guckplan` tabs are blocked.
- Only exact person column headers after `Uhrzeit` are allowed. `Default` remains a reset state, not an ordinary vote option.
- `Okinawa 3` is allowed only for `Quecks`, `Rei` and `Terra`, even if another name is supplied.
- Each requested cell is compared against the browser's previously read value before writing. The Worker requires confirmation of one updated cell and reads it back afterward. Google Sheets values are not an atomic compare-and-swap, so extremely close simultaneous votes on the same cell can still race.
- Users see updated Sheet values on reload and during periodic foreground refreshes.

## Security / tradeoffs

This is **lightweight shared access**, not anonymous public editing. The key is never embedded in the static site, and the Cloudflare service-account credentials never reach the browser. A code is a bearer secret: anyone with it can select a friend's column, and the Worker cannot determine which friend actually voted. Share only with trusted group members and rotate the code if it leaks. Browser dev tools, browser extensions, or an XSS attack may access a code stored in sessionStorage. Restrict Worker CORS to the GitHub Pages origin; CORS alone is not authentication and direct HTTP clients can still send requests if they have the code. Configure rate limiting and review logs as appropriate before wider public use. Never set `GROUP_ACCESS_CODE` to a publicly known value.

Run `node --test tests/season-votes-worker.test.mjs` to verify the access and vote restrictions.

## Seasonal Anime Awards

The same Worker keeps the ballots for `awards.html` in a Cloudflare KV namespace `anime-awards` (binding `AWARDS`),
which the deploy workflow creates on its first run. `GET /awards?season=Herbst 2026` gives only the names of who has
voted until someone presses **Auflösen** (`POST /awards/reveal`); after that it gives all ballots and
`POST /awards/ballot` is refused for that season. A ballot gives up to three picks per category in order
(12, 10 and 8 points, Eurovision style), for 22 categories; a single title from older ballots counts as 12.
**Ceddl of the Year** candidates are collected over the season: `GET /awards/ceddl?season=…`,
`POST /awards/ceddl` `{ season, name, anime, by? }`, `POST /awards/ceddl/remove` `{ season, id }` (closed after
Auflösen, at most 60). The optional group code applies here too. Tests:
`node --test tests/awards-worker.test.mjs`.

## Wrong streaming links (U45 → repair queue N55)

The weekly plan's day menu has "Falschen Link melden". Reports are kept in the same KV namespace (prefix `report:`):
`{ id, at, status: 'pending' | 'fixed' | 'rejected', anilistId, title, service, url, suggestion?, note?, resolvedAt?, resolution? }`.

- `POST /reports` `{ anilistId, title, service, url, suggestion?, note? }`: adds a pending report (https links only,
  short plain text, at most 200 pending; the same link and suggestion again is answered `{ duplicate: true }`).
- `GET /reports?status=pending` (or `fixed`, `rejected`, or no status for all): newest first.
- `POST /reports/resolve` `{ id, status, resolution? }`: closes or reopens one.

The optional group code applies here too. Tests: `node --test tests/link-reports-worker.test.mjs`.

## Only for yourself (Awards ballots, Börse orders, your own Börse account)

The helper checks who is acting. A person with an AniList account in "Wer ist wer" (`wrapped-profiles.json` on the
site) sends their AniList login (`X-AniList-Token`); the helper asks AniList whose it is (`Viewer`) and keeps
nothing. MaRyo's two accounts are two people (RyoTsushigawa = Ryo, MilkyWay95 = Marvin, `ACCOUNT_PERSON`). A person
without AniList sends a PIN (`X-Person-Pin`), set the first time; only a salted SHA-256 is kept (`pin:<person>`),
and 5 wrong tries lock it for 15 minutes. A person with AniList can't be claimed with a PIN.
`GET /identity?person=` says which applies; `POST /identity/check` tests it; the owner resets a PIN with
`POST /identity/pin-reset` `{ person }` and the site's GitHub key in `X-Owner-Key` (checked with GitHub).
Tests: `node --test tests/votes-identity.test.mjs`.
