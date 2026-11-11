# Season Preview — deployment and acceptance checklist

**Target: 31 December 2026.** This file describes what's implemented, what's NOT enabled, and how to activate it without exposing secrets or altering existing Guckplan sheets.

## Current architecture

- `season-preview.html` + `season-preview.js`: public season sheet order, MyAnimeList links, automatic trailers, per-user voting UI, and manually entered browser-local alternative URLs.
- `workers/season-votes/index.js`: private group-code protected Cloudflare Worker, with no AniList login. A friend with the group code can choose any existing group-member vote column. `Default` is a reset state, not an ordinary option; `Okinawa 3` stays restricted to Quecks, Rei, Terra.
- **Trailers (since 11 Nov 2026): automatic, no approval step.** `tools/trailers.mjs` (daily workflow `trailers.yml`, see README "Trailer-Playlist") picks one full trailer per **new** show of each season list ahead (no sequels, nothing carried over from the previous list), writes them into `season-trailers.json` (`auto: true`) and keeps the unlisted YouTube playlist in the list's order. A wrong pick is replaced via `trailer-picks.json`. The earlier review/approval tools (`scripts/season-preview-*.mjs`, `season-trailer-review.yml`, `season-preview.yml`, `season-trailer-candidates.json`) were removed.

## Setup needed by the site owner (do not share credentials in chat or commit them)

1. **Google Sheets voting:** Use `workers/season-votes/README.md`. Share the target Google spreadsheet with the service-account address as **Editor**. Create repository Actions secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SEASON_GOOGLE_SERVICE_ACCOUNT_EMAIL`, `SEASON_GOOGLE_PRIVATE_KEY`, `SEASON_SHEET_ID`, and `SEASON_GROUP_ACCESS_CODE` (random, at least 16 characters). Trigger **Deploy Season Preview voting Worker** manually in GitHub Actions; it uploads the Worker and applies its four private secrets. Share the group code privately, not in the public repository.
2. **Site vote URL:** After the Worker is deployed, add `"previewVotesUrl": "https://<your-votes-worker>.workers.dev"` to `config.json`; keep existing config fields. Verify `GET /access` rejects a wrong code and accepts the private group code. Select a member in the UI and confirm that only an existing Season tab vote cell changes.
3. **YouTube / trailers:** set up once as in README "Trailer-Playlist" (secrets `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` under **Actions** secrets). Nothing to approve: the daily run fills `season-trailers.json` and the playlist; the page shows the trailers and the playlist link.

## Pre-launch acceptance checks

- Winter 2027 appears automatically only after a standalone `Winter 2027` tab exists; use the exact Sheet row order including short-form anime.
- A sequel remains in Season Preview for voting but receives no trailer. A series carried over from the previous standalone Season tab is **hidden entirely from Season Preview** (cards, filters, counts and voting UI); it remains intact in both Google Sheets and the normal schedule. The page compares original/English titles directly with the previous tab, and `tools/trailers.mjs` leaves carried-over titles out of the playlist. If the prior tab is unavailable, only already confirmed carryovers are hidden and the preview displays a warning.
- Each eligible anime yields at most one video in the shared playlist.
- A show without a trailer shows "Trailer folgt" or "Kein passender Trailer"; users can add another site's HTTPS trailer link locally without public publication.
- A friend who enters the private group code can select **any existing group member** and save an exact vote to a standalone Season list, never the active Guckplan. The code does **not** prove the voter's identity. Restricted Okinawa 3 remains checked server-side.
- Manual changes in Google Sheets appear on the website after refresh. When a sheet cell changes between viewing and saving, the site reports a conflict rather than silently claiming success.
- An invalid group code, unknown person column, outdated show row, permission failure or unavailable Worker must never show a fake save confirmation.
- Test desktop and mobile at widths around 360, 390 and 430 px; test keyboard focus and dialogs. Verify Season Preview uses the main site's saved light/dark theme, accent color, compact card and pill styles. Run `node --test tests/season-votes-worker.test.mjs`.
- Test playlist sync twice with no edits: second run should do zero YouTube mutations. Remove/restore one test trailer, then verify unavailable marking and recovery.

## Practical checkpoints toward 31 December 2026

- **By 20 Nov:** Check the automatic trailer picks for Winter 2027 against the Season sheet, its order, and the immediately previous Season's carryovers. The old `tabs.json` listing is not the source for this preview; the workflow and page discover standalone tabs dynamically.
- **By 30 Nov:** Deploy voting Worker with the private group code and complete save/reload tests for an ordinary member, an Okinawa 3 member, a person switch and an invalid code.
- **By 10 Dec:** YouTube login is set up (11 Nov); verify the unlisted playlist and its order.
- **By 20 Dec:** Fix wrong or missing picks via `trailer-picks.json` and finish mobile and multi-user testing.
- **By 31 Dec:** Freeze and validate Winter 2027 release candidate. If the credentials are not complete, do **not** present the feature as finished.

GitHub Actions schedules can be delayed or missed; check the workflow history. Never rely on cron alone for the final pre-season acceptance check.

## LiveChart refresh status (11 November 2026)

LiveChart season metadata was successfully refreshed through [GitHub Actions run #43013545850](https://github.com/RyoTsushigawa/anime-schedule/actions/runs/43013545850). `seasons.json` contains **71/71 LiveChart IDs for Winter 2027** and **109/109 for Autumn 2026**. The workflow `season-livechart-refresh.yml` also runs weekly for current/previous/next seasons. This metadata is public **title and anime link information**, not proof of a verified trailer or subtitles.
