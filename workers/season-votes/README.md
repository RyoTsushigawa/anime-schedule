# Season Preview voting Worker

This Cloudflare Worker is **not deployed automatically**. Until deployment and configuration, the Season Preview stays read-only. Do not put credentials into GitHub Pages files.

## Deploy / configuration

1. Create a Cloudflare Worker using `index.js`. Set the allowed origin to `https://ryotsushigawa.github.io` (default).
2. Create a Google Cloud service account, enable the Sheets API, and share the existing spreadsheet with its service-account email as **Editor**. Keep the service account private key outside the public repository.
3. Configure Worker secrets `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `SHEET_ID`, and `VOTER_MAP_JSON`.
4. `VOTER_MAP_JSON` uses **AniList numeric Viewer IDs** as keys, with a verified person's exact Google Sheets column header and optional delegate names. Example (placeholders only): `{"123456":{"person":"MaRyo","delegates":["Belly"]},"234567":{"person":"Rei"}}`. Get each member's ID from their authenticated AniList Viewer response; never rely on local browser person selection.
5. Only after the Worker responds to `GET /me` with a verified member should `config.json` contain `"previewVotesUrl":"https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev"`. The static site will then offer vote buttons to approved AniList members. The existing AniList login is reused; no second login is required.
6. Restrict Worker access and check logs and rate limits before production rollout.

## Behavior

- `GET /me` verifies the AniList bearer token through AniList's Viewer API, then returns the exact assigned person and explicitly permitted delegates.
- `POST /vote` accepts a Season list `gid`, unique anime title, target person, choice, and expected prior value; the Worker ignores client claims of identity and resolves the sheet tab, row and column server-side.
- Only standalone tabs named `Winter YYYY`, `Frühling YYYY`, `Sommer YYYY`, or `Herbst YYYY` can be changed. **Guckplan** tabs are blocked.
- The site offers only the current member's buttons plus explicitly delegated people; `Default` is the reset/unselected value.
- `Okinawa 3` is restricted in the Worker to `Quecks`, `Rei`, and `Terra`.
- Google Sheets remains authoritative. Edits through the sheet are visible when the website reloads the list, including periodic refresh while the page is open.
- The client uses optimistic concurrency via `expected` and instructs users to reload if the sheet was changed. Google Sheets' values API is not a transactional compare-and-swap; truly simultaneous edits to the *same cell* can still race. If that becomes a concern, serialize updates through a Durable Object.

## Security

The Worker secret maps are **never** published to the website. Tokens are sent over HTTPS for `GET /me` and `POST /vote`, and the Worker checks identity on every request. The existing AniList client stores tokens in browser localStorage; use trusted devices, and review token handling separately if hardening the whole site. Restrict CORS to the one site origin (CORS is not authorization). Service account access should be limited to the one spreadsheet, and production deployments should add a rate limiter.
