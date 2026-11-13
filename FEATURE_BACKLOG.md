# Anime Schedule feature backlog

The feature challenge has **14 of 50 approved standalone features** and **31 approved updates**. This file lists the approvals confirmed by name so far. The earlier chat history available for this handoff does not show all the names, so this list is partial.

## Approved standalone features

| ID | Feature | Status |
| --- | --- | --- |
| N1 | Seasonal Anime Awards | Merged in [PR #161](https://github.com/RyoTsushigawa/anime-schedule/pull/161); shared voting, secret until „Auflösen“, in [PR #163](https://github.com/RyoTsushigawa/anime-schedule/pull/163). |
| N24 | Anime List Health Check | Done: Settings › Listen-Check (forgotten „watching“, progress beyond the episodes, incomplete „completed“, Guckplan shows missing from the list). |
| N35 | Anime Title Lookup | Done (backlog batch 3). Search by English, romaji, Japanese title, or group nickname and show matching Guckplan, AniList, and MyAnimeList entries. |
| N38 | Group Availability Grid | Done (backlog batch 3). Show the whole group's weekly availability, including all-day, partial, and recurring absences. |
| N39 | Schedule Data Status | Done (backlog batch 2). Show when the Guckplan, airing data, and trailer lists last updated and flag saved copies. |
| N44 | Watch Progress Sync History | Done (backlog batch 3). Show recent AniList and MyAnimeList episode updates from this browser, with successes and failures. |
| N52 | Startet bald | Approved (round 7). In the last weeks of a season, the weekly plan shows the next season's premieres that got „Ja“ votes, with their dates. |

## Approved updates

| ID | Update | Status |
| --- | --- | --- |
| | Catch-up Progress Bar | Merged in [PR #151](https://github.com/RyoTsushigawa/anime-schedule/pull/151). |
| U21 | Synopsis Quiz Daily Archive | Done (backlog batch 3). |
| U23 | Synopsis Quiz Statistics | Done (backlog batch 3). |
| U25 | Catch-up Pinned Anime | Done (backlog batch 3). |
| U27 | Season Preview · Next Unvoted Show | Done (backlog batch 1). After a vote saves, offer to jump to the next unvoted show for the selected voter and show how many are left. |
| U29 | Absences · Filter by Person | Done (backlog batch 1). Filter entries in Kalender and Wiederkehrend by person, with an All option. |
| U32 | Weekly Plan · Hide Covers | Done (backlog batch 2). Add a text-only view that keeps times, episode numbers, and watch controls visible. |
| U34 | Discord Schedule · Compact Copy | Done (backlog batch 2). Offer a shorter copy format with start times, titles, and episode numbers. |
| U37 | Season Preview · Remember My Filters | Done (backlog batch 1). Restore the last selected voter and filters. |
| U39 | Weekly Plan · Explain Absence Pauses | Done (backlog batch 2). Open the existing Abwesend badge to see who was unavailable at the scheduled time and why the show was paused. |
| U42 | Season Preview · Save an Unsent Vote | Done (backlog batch 1). Keep a failed vote as a draft on its show so the voter can retry later. |
| U45 | Watch-Planer · Take Over Absences | Approved (round 7). Recurring absences (e.g. „Sophie jeden Sa“) are taken over as busy times in the Watch planner instead of being entered by hand. |

## Curation decisions

- Since 13 Nov: keep updates to a minimum and propose mainly new standalone features. Approved items are only recorded for now; once 50 standalone features are approved, everything is built at once.
- Require a concrete user benefit for every proposal. Treat 50 as a target and keep the bar for approval consistent.
- Keep the interface clean and easy to understand. Prefer existing entry points and add controls only where they help users complete a task.
- Check current main, open PRs, and approved backlog items for overlapping workflows. Improve an existing feature when it already serves the same purpose.
- Count only approved standalone features toward 50. Keep updates in their own list.
- Preserve the four earlier maybes and the undecided N7–N9. N26 Anime Airing Changes Tracker is a separate maybe.
- Rejected ideas stay excluded, including round 7's N47 Week Plan as Image, N48 Drop Radar, N49 Show Info Card, N50 Group Tier List, N51 Games Leaderboard, U43 Absences · Preview Effects, U44 Catch-up · Catch Up Together, U46 New Badges, U47 Season Preview · Who Still Votes, U48 List Check · One-Tap Fixes, U41 Weekly Plan · Remind Me Before a Show, N21 Anime Screenshot Quiz and the Catch-up Quick Actions / Search & Filters updates (all skipped by the owner on 13 Nov; Catch-up already has steppers, bulk actions and search), U38 Weekly Plan · Time Zone Override (scrapped by the owner), N27 Season Vote Results Board, U28 Weekly Plan · Estimated Finish Time, N28 Calendar Export, N29 Group Watch Journal, N30 Anime Cast Explorer, N31 New Season Setup Checklist, U30 Season Preview · Mark Trailers Watched, N32 Anime Franchise Guide, N33 Anime Recommendation Inbox, U31 Tier List · Undo Last Move, N34 Guckplan Comparison, N36 Episode Runtime Calculator, N37 Anime Source Material Finder, U33 Weekly Plan · Copy Day Link, N40 Episode Finder, N41 Personal Rating Breakdown, U35 Catch-up · Time per Show, N42 Guckplan Validator, N43 Season Finale Calendar, U36 Weekly Plan · Collapse All Days, N45 Guckplan Backup Browser, U40 Weekly Plan · Jump to a Date, and N46 Watch Night Display. Keep new game ideas out of future rounds.
- Check current main and open PRs before claiming an item. Update the status here when implementation moves forward.