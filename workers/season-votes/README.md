# Season Preview group voting Worker

Season Preview voting is designed for a small friend group. **No AniList login or account mapping is needed.** One shared private group code unlocks voting for the current browser session, after which friends select any existing group member column. This is intentionally **not an individual identity system**: anyone with the code may cast or change any group member's vote.

## Setup

1. Create a Google Cloud service account, enable Google Sheets API, and share the target spreadsheet with its email address as Editor. The service-account private key must never be published in front-end files.
2. Add these **GitHub Actions repository secrets**: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SEASON_GOOGLE_SERVICE_ACCOUNT_EMAIL`, `SEASON_GOOGLE_PRIVATE_KEY`, `SEASON_SHEET_ID` and `SEASON_GROUP_ACCESS_CODE`.
3. Choose a randomly generated shared access code of at least **16 characters**; 24–32 random characters is better. Share it privately with the group. Do **not** commit it to GitHub, put it in `config.json`, or paste it into a public chat. Anyone who learns it can vote as any member.
4. Run the manual GitHub Actions workflow **Deploy Season Preview voting Worker**. It deploys `workers/season-votes/index.js` and applies `GROUP_ACCESS_CODE`, `SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `GOOGLE_PRIVATE_KEY` as private Worker secrets.
5. Add the public deployed Worker URL (not the secret code) as `previewVotesUrl` in `config.json`, preserving other fields; for example `"previewVotesUrl":"https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev"`.
6. Open Season Preview, enter the group code, select a member, and test a vote. The code stays only in `sessionStorage` and disappears when that browser session ends; the selected member name can remain saved locally.

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
