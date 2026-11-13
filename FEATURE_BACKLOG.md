# Anime Schedule feature backlog

The feature challenge has **20 of 50 approved standalone features** and **47 approved updates**. This file lists the approvals confirmed by name so far. The earlier chat history available for this handoff does not show all the names, so this list is partial.

## Approved standalone features

| ID | Feature | Status |
| --- | --- | --- |
| N1 | Seasonal Anime Awards | Merged in [PR #161](https://github.com/RyoTsushigawa/anime-schedule/pull/161). |
| N21 | Anime Screenshot Quiz | Approved before the decision to stop proposing new games. |
| N24 | Anime List Health Check | Approved. |
| N35 | Anime Title Lookup | Merged in [PR #169](https://github.com/RyoTsushigawa/anime-schedule/pull/169). Search by English, romaji, Japanese title, or group nickname and show matching Guckplan, AniList, and MyAnimeList entries. |
| N38 | Group Availability Grid | Merged in [PR #168](https://github.com/RyoTsushigawa/anime-schedule/pull/168). Show the whole group's weekly availability, including all-day, partial, and recurring absences. |
| N39 | Schedule Data Status | Merged in [PR #167](https://github.com/RyoTsushigawa/anime-schedule/pull/167). Show when the Guckplan, airing data, and trailer lists last updated and flag saved copies. |
| N44 | Watch Progress Sync History | Merged in [PR #169](https://github.com/RyoTsushigawa/anime-schedule/pull/169). Show recent AniList and MyAnimeList episode updates from this browser, with successes and failures. |
| N48 | Personal Schedule Change Inbox | Approved. Show moves, pauses, and additions since the last visit for shows on the selected person's plan. |
| N50 | Episode Number Crosswalk | Approved. Match streaming season and episode numbering to the Guckplan, AniList, and MyAnimeList where mappings are known. |
| N55 | Maintainer Repair Queue | Approved. Review wrong streaming-link reports, verify proposed fixes, and mark reports resolved. Use U45 as the reporting entry point. |
| N59 | AniList ↔ MyAnimeList Transfer Assistant | Approved. Preview a provider transfer, resolve title or progress mismatches, and select entries to copy. |
| N61 | Guckplan Editor Access | Approved. Let the plan owner grant trusted members permission to move shows without sharing the owner's GitHub key. Keep management owner-only. |
| N63 | Discord Delivery Queue | Approved. Show failed schedule deliveries and allow one retry with duplicate protection. |
| N66 | Plan Issue Diagnostic Report | Approved. Generate a shareable report for a show with missing or inconsistent data, including title IDs, source, and last refresh. Exclude credentials and personal watch progress. |

## Approved updates

| ID | Update | Status |
| --- | --- | --- |
| | Catch-up Quick Actions | Main already has episode steppers and bulk actions. Confirm which additional action is needed before implementing. |
| | Catch-up Search & Filters | Main already has title search. Check existing filters before extending it. |
| | Catch-up Progress Bar | Merged in [PR #151](https://github.com/RyoTsushigawa/anime-schedule/pull/151). |
| U21 | Synopsis Quiz Daily Archive | Merged in [PR #168](https://github.com/RyoTsushigawa/anime-schedule/pull/168). |
| U23 | Synopsis Quiz Statistics | Merged in [PR #168](https://github.com/RyoTsushigawa/anime-schedule/pull/168). |
| U25 | Catch-up Pinned Anime | Merged in [PR #168](https://github.com/RyoTsushigawa/anime-schedule/pull/168). |
| U27 | Season Preview · Next Unvoted Show | Merged in [PR #166](https://github.com/RyoTsushigawa/anime-schedule/pull/166). After a vote saves, offer to jump to the next unvoted show for the selected voter and show how many are left. |
| U29 | Absences · Filter by Person | Merged in [PR #166](https://github.com/RyoTsushigawa/anime-schedule/pull/166). Filter entries in Kalender and Wiederkehrend by person, with an All option. |
| U32 | Weekly Plan · Hide Covers | Merged in [PR #167](https://github.com/RyoTsushigawa/anime-schedule/pull/167). Add a text-only view that keeps times, episode numbers, and watch controls visible. |
| U34 | Discord Schedule · Compact Copy | Merged in [PR #167](https://github.com/RyoTsushigawa/anime-schedule/pull/167). Offer a shorter copy format with start times, titles, and episode numbers. |
| U37 | Season Preview · Remember My Filters | Merged in [PR #166](https://github.com/RyoTsushigawa/anime-schedule/pull/166). Restore the last selected voter and filters. |
| U38 | Weekly Plan · Time Zone Override | Approved. Show the same schedule in Berlin time, device-local time, or a chosen time zone through the existing time settings. |
| U39 | Weekly Plan · Explain Absence Pauses | Merged in [PR #167](https://github.com/RyoTsushigawa/anime-schedule/pull/167). Open the existing Abwesend badge to see who was unavailable at the scheduled time and why the show was paused. |
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
| U59 | Seasonal Anime Awards · Skip a Category | Approved. Let voters explicitly skip a category and distinguish it from an unanswered category during ballot review. |
| U61 | Weekly Plan · Flag a Scheduling Conflict | Approved. Warn in the existing move dialog when the new slot overlaps another show for any of the same viewers. Leave the decision to the editor. |
| U62 | Absences · Preview Affected Shows | Approved. In the existing editor, preview which already-scheduled shows would pause under the group’s attendance rules before saving. |
| U63 | Weekly Plan · Warn When Moving Before Airing | Approved. Flag a proposed slot before the episode’s confirmed release time and show that time in the existing move dialog. |
| U66 | Weekly Plan · End Date for a Temporary Move | Approved. Let the temporary slot run through a chosen week and then restore the regular slot automatically. |

## Curation decisions

- Require a concrete user benefit for every proposal. Treat 50 as a target and keep the bar for approval consistent.
- Keep the interface clean and easy to understand. Prefer existing entry points and add controls only where they help users complete a task.
- Check current main, open PRs, and approved backlog items for overlapping workflows. Improve an existing feature when it already serves the same purpose.
- Count only approved standalone features toward 50. Keep updates in their own list.
- Preserve the four earlier maybes and the undecided N7–N9. N26 Anime Airing Changes Tracker is a separate maybe.
- Rejected ideas stay excluded, including N27 Season Vote Results Board, U28 Weekly Plan · Estimated Finish Time, N28 Calendar Export, N29 Group Watch Journal, N30 Anime Cast Explorer, N31 New Season Setup Checklist, U30 Season Preview · Mark Trailers Watched, N32 Anime Franchise Guide, N33 Anime Recommendation Inbox, U31 Tier List · Undo Last Move, N34 Guckplan Comparison, N36 Episode Runtime Calculator, N37 Anime Source Material Finder, U33 Weekly Plan · Copy Day Link, N40 Episode Finder, N41 Personal Rating Breakdown, U35 Catch-up · Time per Show, N42 Guckplan Validator, N43 Season Finale Calendar, U36 Weekly Plan · Collapse All Days, N45 Guckplan Backup Browser, U40 Weekly Plan · Jump to a Date, N46 Watch Night Display, N47 Group Watch Progress, U47 Catch-up · Choose How Long to Snooze, U49 Weekly Plan · High-Contrast Labels, U55 Weekly Plan · Pause a Whole Day, U58 Weekly Plan · Jump from an Alert to Its Show, U60 Tier List · Find a Title, U64 Seasonal Anime Awards · Copy My Draft to Another Device, U65 Weekly Plan · Print the Current View, U67 Search · Remove One Recent Search, U68 Weekly Plan · Reason for a Slot Move, U69 Season Preview · Filter by Format, U70 Seasonal Anime Awards · Reset My Draft, N49 Anime Content Warnings, N51 New Member Setup, N53 Sequel Follow List, N54 Make-up Slot Poll, N56 Shared Watch Queue for Finished Shows, N57 Personal Discord Digest, N58 Offline Watch Log, N60 Schedule Edit History, N62 Scheduled Plan Publication, N64 Time-Limited Guest View, N65 Plan Ownership Handoff, N67 Schedule Profiles, N68 Audio and Subtitle Guide, N69 Shared Break Timer, N71 Personal Data Manager, and N72 Anime Edition Guide. Keep new game ideas out of future rounds.
- N70 Guckplan Sandbox was withdrawn due to overlap with the Watch planner's Testmodus.
- N52 Personal Rewatch Tracker was withdrawn due to overlap with Non-seasonal and existing rewatch handling.
- For now, curate standalone features only, in batches of five.
- U71 Weekly Plan · Hide Scores was withdrawn. The Weekly Plan does not display public ratings before watching. Personal scoring is available after completion.
- Check current main and open PRs before claiming an item. Update the status here when implementation moves forward.