# Anime Schedule feature backlog

The feature challenge has **13 of 50 approved standalone features** and **28 approved updates**. This file lists the approvals confirmed by name so far. The earlier chat history available for this handoff does not show all the names, so this list is partial.

## Approved standalone features

| ID | Feature | Status |
| --- | --- | --- |
| N1 | Seasonal Anime Awards | Merged in [PR #161](https://github.com/RyoTsushigawa/anime-schedule/pull/161). |
| N21 | Anime Screenshot Quiz | Approved before the decision to stop proposing new games. |
| N24 | Anime List Health Check | Approved. |
| N35 | Anime Title Lookup | Approved. Search by English, romaji, Japanese title, or group nickname and show matching Guckplan, AniList, and MyAnimeList entries. |
| N38 | Group Availability Grid | Approved. Show the whole group's weekly availability, including all-day, partial, and recurring absences. |
| N39 | Schedule Data Status | Approved. Show when the Guckplan, airing data, and trailer lists last updated and flag saved copies. |
| N44 | Watch Progress Sync History | Approved. Show recent AniList and MyAnimeList episode updates from this browser, with successes and failures. |

## Approved updates

| ID | Update | Status |
| --- | --- | --- |
| | Catch-up Quick Actions | Main already has episode steppers and bulk actions. Confirm which additional action is needed before implementing. |
| | Catch-up Search & Filters | Main already has title search. Check existing filters before extending it. |
| | Catch-up Progress Bar | Merged in [PR #151](https://github.com/RyoTsushigawa/anime-schedule/pull/151). |
| U21 | Synopsis Quiz Daily Archive | Approved. |
| U23 | Synopsis Quiz Statistics | Approved. |
| U25 | Catch-up Pinned Anime | Approved. |
| U27 | Season Preview · Next Unvoted Show | Approved. After a vote saves, offer to jump to the next unvoted show for the selected voter and show how many are left. |
| U29 | Absences · Filter by Person | Approved. Filter entries in Kalender and Wiederkehrend by person, with an All option. |
| U32 | Weekly Plan · Hide Covers | Approved. Add a text-only view that keeps times, episode numbers, and watch controls visible. |
| U34 | Discord Schedule · Compact Copy | Approved. Offer a shorter copy format with start times, titles, and episode numbers. |
| U37 | Season Preview · Remember My Filters | Approved. Restore the last selected voter and filters. |
| U38 | Weekly Plan · Time Zone Override | Approved. Show the same schedule in Berlin time, device-local time, or a chosen time zone through the existing time settings. |
| U39 | Weekly Plan · Explain Absence Pauses | Approved. Open the existing Abwesend badge to see who was unavailable at the scheduled time and why the show was paused. |

## Curation decisions

- Require a concrete user benefit for every proposal. Treat 50 as a target and keep the bar for approval consistent.
- Keep the interface clean and easy to understand. Prefer existing entry points and add controls only where they help users complete a task.
- Check current main, open PRs, and approved backlog items for overlapping workflows. Improve an existing feature when it already serves the same purpose.
- Count only approved standalone features toward 50. Keep updates in their own list.
- Preserve the four earlier maybes and the undecided N7–N9. N26 Anime Airing Changes Tracker is a separate maybe.
- Rejected ideas stay excluded, including N27 Season Vote Results Board, U28 Weekly Plan · Estimated Finish Time, N28 Calendar Export, N29 Group Watch Journal, N30 Anime Cast Explorer, N31 New Season Setup Checklist, U30 Season Preview · Mark Trailers Watched, N32 Anime Franchise Guide, N33 Anime Recommendation Inbox, U31 Tier List · Undo Last Move, N34 Guckplan Comparison, N36 Episode Runtime Calculator, N37 Anime Source Material Finder, U33 Weekly Plan · Copy Day Link, N40 Episode Finder, N41 Personal Rating Breakdown, U35 Catch-up · Time per Show, N42 Guckplan Validator, N43 Season Finale Calendar, U36 Weekly Plan · Collapse All Days, N45 Guckplan Backup Browser, and U40 Weekly Plan · Jump to a Date. Keep new game ideas out of future rounds.
- Check current main and open PRs before claiming an item. Update the status here when implementation moves forward.