# Anime Schedule feature backlog

The feature challenge has **13 of 50 approved standalone features** and **42 approved updates**. This file lists the approvals confirmed by name so far. The earlier chat history available for this handoff does not show all the names, so this list is partial.

## Approved standalone features

| ID | Feature | Status |
| --- | --- | --- |
| N1 | Seasonal Anime Awards | Merged in [PR #161](https://github.com/RyoTsushigawa/anime-schedule/pull/161). |
| N21 | Anime Screenshot Quiz | Approved before the decision to stop proposing new games. |
| N24 | Anime List Health Check | Approved. |
| N35 | Anime Title Lookup | Approved. Search by English, romaji, Japanese title, or group nickname and show matching Guckplan, AniList, and MyAnimeList entries. |
| N38 | Group Availability Grid | Approved. Show the whole group's weekly availability, including all-day, partial, and recurring absences. |
| N39 | Schedule Data Status | In [PR #167](https://github.com/RyoTsushigawa/anime-schedule/pull/167). Show when the Guckplan, airing data, and trailer lists last updated and flag saved copies. |
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
| U27 | Season Preview · Next Unvoted Show | Merged in [PR #166](https://github.com/RyoTsushigawa/anime-schedule/pull/166). After a vote saves, offer to jump to the next unvoted show for the selected voter and show how many are left. |
| U29 | Absences · Filter by Person | Merged in [PR #166](https://github.com/RyoTsushigawa/anime-schedule/pull/166). Filter entries in Kalender and Wiederkehrend by person, with an All option. |
| U32 | Weekly Plan · Hide Covers | In [PR #167](https://github.com/RyoTsushigawa/anime-schedule/pull/167). Add a text-only view that keeps times, episode numbers, and watch controls visible. |
| U34 | Discord Schedule · Compact Copy | In [PR #167](https://github.com/RyoTsushigawa/anime-schedule/pull/167). Offer a shorter copy format with start times, titles, and episode numbers. |
| U37 | Season Preview · Remember My Filters | Merged in [PR #166](https://github.com/RyoTsushigawa/anime-schedule/pull/166). Restore the last selected voter and filters. |
| U38 | Weekly Plan · Time Zone Override | Approved. Show the same schedule in Berlin time, device-local time, or a chosen time zone through the existing time settings. |
| U39 | Weekly Plan · Explain Absence Pauses | In [PR #167](https://github.com/RyoTsushigawa/anime-schedule/pull/167). Open the existing Abwesend badge to see who was unavailable at the scheduled time and why the show was paused. |
| U41 | Weekly Plan · Remind Me Before a Show | Approved. Offer an optional reminder from the existing watch-slot menu. |
| U42 | Season Preview · Save an Unsent Vote | Merged in [PR #166](https://github.com/RyoTsushigawa/anime-schedule/pull/166). Keep a failed vote as a draft on its show so the voter can retry later. |
| U43 | Weekly Plan · Hide Watched Episodes | Approved. Add an on/off toggle in the existing Solo view controls. On hides watched episodes. Off restores the full plan in one click. |
| U44 | Seasonal Anime Awards · Search Nominees | Approved. Make the existing nominee picker searchable by title. |
| U45 | Weekly Plan · Report a Wrong Streaming Link | Approved. Flag incorrect links from the show menu, with an optional replacement URL for the maintainer. |
| U46 | Seasonal Anime Awards · Ballot Progress | Approved. Show how many people have submitted before the reveal while keeping their choices secret. |
| U48 | Search · Clear Recent Searches | Approved. Clear this browser's recent title suggestions from the existing settings menu. |
| U50 | Catch-up · Restore One Snoozed Show | Approved. Open the existing Später count to restore one show while keeping the others snoozed. |
| U51 | Absences · Undo Accidental Removal | Approved. Restore the removed absence from the existing save notice, including its dates and time rules. |
| U52 | Season Preview · Trailer Length | Approved. Show the runtime in the existing trailer link when known. |
| U53 | Weekly Plan · Hide Empty Days | Approved. Add a toggle in the existing view controls. Keep days with pauses or absences visible. |
| U54 | Seasonal Anime Awards · Voting Deadline | Approved. Show the deadline and automatically close voting at the start of the following anime season. Keep the reveal manual. |
| U56 | Absences · Flag Overlapping Entries | Approved. Show overlapping recurring rules for the same person in the existing editor. |
| U57 | Weekly Plan · Copy Streaming Link | Approved. Copy the stream link already shown on the row from the existing show menu. |

## Curation decisions

- Require a concrete user benefit for every proposal. Treat 50 as a target and keep the bar for approval consistent.
- Keep the interface clean and easy to understand. Prefer existing entry points and add controls only where they help users complete a task.
- Check current main, open PRs, and approved backlog items for overlapping workflows. Improve an existing feature when it already serves the same purpose.
- Count only approved standalone features toward 50. Keep updates in their own list.
- Preserve the four earlier maybes and the undecided N7–N9. N26 Anime Airing Changes Tracker is a separate maybe.
- Rejected ideas stay excluded, including N27 Season Vote Results Board, U28 Weekly Plan · Estimated Finish Time, N28 Calendar Export, N29 Group Watch Journal, N30 Anime Cast Explorer, N31 New Season Setup Checklist, U30 Season Preview · Mark Trailers Watched, N32 Anime Franchise Guide, N33 Anime Recommendation Inbox, U31 Tier List · Undo Last Move, N34 Guckplan Comparison, N36 Episode Runtime Calculator, N37 Anime Source Material Finder, U33 Weekly Plan · Copy Day Link, N40 Episode Finder, N41 Personal Rating Breakdown, U35 Catch-up · Time per Show, N42 Guckplan Validator, N43 Season Finale Calendar, U36 Weekly Plan · Collapse All Days, N45 Guckplan Backup Browser, U40 Weekly Plan · Jump to a Date, N46 Watch Night Display, N47 Group Watch Progress, U47 Catch-up · Choose How Long to Snooze, U49 Weekly Plan · High-Contrast Labels, and U55 Weekly Plan · Pause a Whole Day. Keep new game ideas out of future rounds.
- Check current main and open PRs before claiming an item. Update the status here when implementation moves forward.