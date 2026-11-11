# Season Preview — deployment and acceptance checklist

**Target: 31 December 2026.** This file describes what's implemented, what's NOT enabled, and how to activate it without exposing secrets or altering existing Guckplan sheets.

## Current architecture

- `season-preview.html` + `season-preview.js`: public season sheet order, MyAnimeList links, approved trailer alternatives, per-user voting UI, and manually entered browser-local alternative URLs.
- `workers/season-votes/index.js`: separate Cloudflare Worker (not deployed by this repository) to verify AniList access tokens and write only the verified person's (or approved delegate's) Season-list Google Sheets cell. `Default` is an untouched/reset value, never an ordinary choice. `Okinawa 3` only for Quecks, Rei, Terra.
- `scripts/season-preview-discover.mjs`: checks standalone Season tabs through the Google Sheets API, discovers **unreviewed candidates** from AniList trailer metadata and optional quota-limited YouTube search, flags sequel candidates for exclusion. It never adds a video without human verification.
- `scripts/season-preview-approve.mjs`: local or reviewed-repository tool that records a human-reviewed official full trailer, or exceptional teaser after confirming no adequate full trailer exists.
- `scripts/season-preview-playlist.mjs`: YouTube OAuth-based playlist creator/synchronizer for the existing approved catalog. One selected video per non-sequel show in exact Sheet order, including short anime. Checks availability with YouTube's API before changes, uses approved alternatives where available, and records unavailable IDs.
- `.github/workflows/season-preview.yml`: scheduled daily discovery and conditional playlist synchronization plus tests.

## Setup needed by the site owner (do not share credentials in chat or commit them)

1. **Google Sheets voting:** Use `workers/season-votes/README.md`. Share the target Google spreadsheet with the service-account address as **Editor**. Create repository Actions secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SEASON_GOOGLE_SERVICE_ACCOUNT_EMAIL`, `SEASON_GOOGLE_PRIVATE_KEY`, `SEASON_SHEET_ID`, and `SEASON_VOTER_MAP_JSON`. The numeric AniList Viewer ID-to-Sheet-person mapping (plus explicitly allowed delegate names) belongs in the last secret, not in public files. Trigger **Deploy Season Preview voting Worker** manually in GitHub Actions; it uploads the Worker and applies the four Worker-only secrets. Never paste tokens into chat.
2. **Site vote URL:** After the worker is deployed, add `"previewVotesUrl": "https://<your-votes-worker>.workers.dev"` to `config.json`; keep existing config fields. Check `GET /me` from an already connected AniList user and verify exactly their person column appears. Reject unauthorized or expired tokens.
3. **YouTube:** In a Google Cloud project, enable YouTube Data API v3. Authorize the channel that should own the playlists using OAuth 2.0 with permission to manage YouTube playlists. Configure repository **Actions secrets** `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`. Do not place these in site JSON, front-end JS, issues or logs. Playlists are created unlisted by default and can be made public manually after review.
4. **First discovery run:** Optionally add repository Actions secret `YOUTUBE_API_KEY` (YouTube Data API v3) for up to six *unreviewed* YouTube search queries per season per run; without it, AniList discovery still works. In GitHub Actions manually trigger **Season Preview trailers and playlist**. Check logs for `No season sheets detected` or API failures. `season-trailer-candidates.json` is a **review queue**, not proof a video shows the anime. No automatic approvals occur.
5. **Approve trailers:** Review actual footage and official sources (including subtitle options, LiveChart information, YouTube), then run e.g.
   `node scripts/season-preview-approve.mjs --season winter-2027 --key "exact lowercase sheet title" --youtube ABCDEFGHIJK --type full_trailer --confirmed-official --confirmed-footage --confirmed-not-sequel --subs en`
   Check the exact 11-character ID first. For a last-resort teaser, add `--type teaser --confirmed-no-full`, but only after no substantive official full trailer is available. Do not approve sequels. `--alternate` adds a **verified viewing alternative**, not a second playlist entry.
6. **Re-run the workflow:** With review changes committed and OAuth secrets configured, the script creates or updates the unlisted playlist and writes its ID into `season-trailers.json`. The website then shows the playlist link. The sync checks official videos for availability, changes order using YouTube playlist item positions and removes obsolete videos **only from these dedicated managed playlists**.

**Important:** AniList's trailer field, a YouTube video title or LiveChart listing cannot alone guarantee a *full* trailer, correct show footage, subtitles, or the absence of sequel spoilers. Therefore videos stay pending until reviewed. Automatic subsequent sync handles approved videos, ordering, availability and replacement by a newly approved full trailer.

## Pre-launch acceptance checks

- Winter 2027 appears automatically only after a standalone `Winter 2027` tab exists; use the exact Sheet row order including short-form anime.
- A sequel remains in Season Preview for voting but receives no trailer. A series carried over from the previous standalone Season tab is **hidden entirely from Season Preview** (cards, filters, counts and voting UI); it remains intact in both Google Sheets and the normal schedule. The page compares original/English titles directly with the previous tab, while discovery excludes carried-over titles from playlist approval. If the prior tab is unavailable, only already confirmed carryovers are hidden and the preview displays a warning.
- Each eligible anime yields at most one video in the shared playlist; a teaser is labeled as a fallback and is superseded by a verified full trailer.
- A missing YouTube trailer appears as unreviewed or checked/not found; users can add another site's HTTPS trailer link locally without public publication.
- A viewer can select among manually verified alternatives locally, while the shared YouTube playlist remains one-video-per-show.
- A verified AniList account can save its **own** exact vote to a standalone Season list, not the active Guckplan; restricted Okinawa 3 and authorized delegation rules apply server-side.
- Manual changes in Google Sheets appear on the website after refresh. When a sheet cell changes between viewing and saving, the site reports a conflict rather than silently claiming success.
- An invalid AniList token, unknown person, outdated show row, permission failure or unavailable worker must never show a fake save confirmation.
- Test desktop and mobile at widths around 360, 390 and 430 px; test keyboard focus and dialogs. Verify Season Preview uses the main site's saved light/dark theme, accent color, compact card and pill styles. Run `node --test tests/season-preview.test.mjs`.
- Test playlist sync twice with no edits: second run should do zero YouTube mutations. Remove/restore one test trailer, then verify unavailable marking and recovery.

## Practical checkpoints toward 31 December 2026

- **By 20 Nov:** Run the workflow after the Winter 2027 standalone Season tab exists. Verify the first candidate report against the Season sheet, its order, and the immediately previous Season's carryovers. The old `tabs.json` listing is not the source for this preview; the workflow and page discover standalone tabs dynamically.
- **By 30 Nov:** Deploy voting Worker and complete live AniList-to-Google-Sheets save/reload tests for a normal member, an Okinawa 3 member and a delegated member.
- **By 10 Dec:** Configure YouTube OAuth and verify first unlisted playlist creation and automatic order synchronization.
- **By 20 Dec:** Review missing/teaser cases and finish mobile, subtitle and multi-user testing.
- **By 31 Dec:** Freeze and validate Winter 2027 release candidate. If the credentials or manual video reviews are not complete, do **not** present the feature as finished.

GitHub Actions schedules can be delayed or missed; check the workflow history. Never rely on cron alone for the final pre-season acceptance check.

## LiveChart subtitle-first trailer review

LiveChart's per-anime video selector is the preferred **manual review source** for German/English subtitle choices. On the next LiveChart seasons refresh, the parser now records `livechartId` in `seasons.json`, enabling precise LiveChart anime links in the Preview rather than repeated homepage links. YouTube's API still manages the playlist; a LiveChart video listing alone does not verify meaningful footage, captions or sequel classification. LiveChart has no documented public API for exporting its subtitle-filtered video choices, so do not infer or auto-approve videos from unofficial endpoints. Review actual links and record approved entries in the trailer catalog.
