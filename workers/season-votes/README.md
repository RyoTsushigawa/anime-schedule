# Season Preview group voting Worker

Season Preview voting is designed for a small friend group. **No AniList login or account mapping is needed.** One shared private group code unlocks voting for the current browser session, after which friends select any existing group member column. This is intentionally **not an individual identity system**: anyone with the code may cast or change any group member's vote.

## Setup

Google blocks key files for service accounts by default, so the Worker writes as the **sheet owner** through their own
Google login (the same OAuth client as the trailer playlists, but a separate key that may only use Google Sheets).

1. Google Cloud (the trailer playlist project): **APIs & Services → Library → Google Sheets API → Enable**.
2. On the PC in `tools`: `node youtube-login.mjs --sheets`, log in with the account that owns the Guckplan sheet.
   It saves `tools/sheets-refresh-token.txt` (PC only, never uploaded or pasted anywhere).
3. GitHub **Actions** secrets: `SEASON_GOOGLE_REFRESH_TOKEN` (that file's line), `SEASON_SHEET_ID`,
   `SEASON_GROUP_ACCESS_CODE` (16+ random characters, shared privately with the group), `CLOUDFLARE_API_TOKEN`
   (template "Edit Cloudflare Workers") and `CLOUDFLARE_ACCOUNT_ID`. `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET` are
   reused. (A service account still works where allowed: `SEASON_GOOGLE_SERVICE_ACCOUNT_EMAIL` + `SEASON_GOOGLE_PRIVATE_KEY`.)
4. Run the manual GitHub Actions workflow **Deploy Season Preview voting Worker**.
5. Add the Worker's URL as `previewVotesUrl` in `config.json`; the voting bar then appears on the Season Preview.
6. Enter the group code there once per browser session, choose a name, vote.

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
