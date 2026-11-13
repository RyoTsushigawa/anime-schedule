# Anime Schedule feature backlog

The feature challenge has **24 of 50 approved standalone features**. This file joins the approvals from the ChatGPT rounds (#159) and the Claude rounds (#176/#178) into one list. Claude's items got new IDs where an ID was already taken (N83–N85, U74). On 13 Nov the owner decided to start building the approved items now instead of waiting for 50.

## Approved standalone features

| ID | Feature | Status |
| --- | --- | --- |
| N1 | Seasonal Anime Awards | Merged in [PR #161](https://github.com/RyoTsushigawa/anime-schedule/pull/161). |
| N24 | Anime List Health Check | Merged in [PR #172](https://github.com/RyoTsushigawa/anime-schedule/pull/172): Settings › Listen-Check. |
| N35 | Anime Title Lookup | Merged in [PR #169](https://github.com/RyoTsushigawa/anime-schedule/pull/169). Search by English, romaji, Japanese title, or group nickname and show matching Guckplan, AniList, and MyAnimeList entries. |
| N38 | Group Availability Grid | Merged in [PR #168](https://github.com/RyoTsushigawa/anime-schedule/pull/168). Show the whole group's weekly availability, including all-day, partial, and recurring absences. |
| N39 | Schedule Data Status | Merged in [PR #167](https://github.com/RyoTsushigawa/anime-schedule/pull/167). Show when the Guckplan, airing data, and trailer lists last updated and flag saved copies. |
| N44 | Watch Progress Sync History | Merged in [PR #169](https://github.com/RyoTsushigawa/anime-schedule/pull/169). Show recent AniList and MyAnimeList episode updates from this browser, with successes and failures. |
| N48 | Personal Schedule Change Inbox | Approved. Show moves, pauses, and additions since the last visit for shows on the selected person's plan. |
| N50 | Episode Number Crosswalk | Approved. Match streaming season and episode numbering to the Guckplan, AniList, and MyAnimeList where mappings are known. |
| N55 | Maintainer Repair Queue | Done: Einstellungen › Link-Meldungen (only with the plan's GitHub key). Lists open U45 reports, checks a proposed link against the service's own site, Übernehmen saves it to link-fixes.json (applied on top of the generated links) and closes every report about that link; Erledigt / Ablehnen close one. |
| N59 | AniList ↔ MyAnimeList Transfer Assistant | Preview done: Settings › AniList ↔ MAL vergleichen (differences, one side only, no MAL ID; nothing is written). Copying selected entries is the follow-up. Preview a provider transfer, resolve title or progress mismatches, and select entries to copy. |
| N61 | Guckplan Editor Access | Approved. Let the plan owner grant trusted members permission to move shows without sharing the owner's GitHub key. Keep management owner-only. |
| N63 | Discord Delivery Queue | Approved. Show failed schedule deliveries and allow one retry with duplicate protection. |
| N66 | Plan Issue Diagnostic Report | Merged with the integration of ChatGPT's PRs ([#179](https://github.com/RyoTsushigawa/anime-schedule/pull/179)): day menu › Seriendaten prüfen. Generate a shareable report for a show with missing or inconsistent data, including title IDs, source, and last refresh. Exclude credentials and personal watch progress. |
| N74 | Linked Account Troubleshooter | Merged with the integration of ChatGPT's PRs ([#175](https://github.com/RyoTsushigawa/anime-schedule/pull/175)): Settings › Kontoverbindung prüfen. |
| N75 | Upcoming Plan Readiness | Approved. Surface upcoming sessions that need a decision and link to the existing editor. |
| N80 | Personal Catch-up Planner | Approved. Build on the existing multi-day Nachholen planner and add per-day time budgets around existing watch slots. Use the existing planner entry point. |
| N83 | Startet bald | Done: a „Startet bald“ box in the weekly plan. In the last weeks of a season, the weekly plan shows the next season's premieres that got „Ja“ votes, with their dates. |
| N84 | Awards Hall of Fame | Done: Awards page › Ruhmeshalle. All revealed Seasonal Anime Awards at a glance: winners per season and category, and who most often voted for the winner. |
| N85 | Readability | Done: Settings › Anzeige & Listen › Lesbarkeit. A setting for text size and a higher-contrast mode. |

## Approved updates

| ID | Update | Status |
| --- | --- | --- |
| | Catch-up Progress Bar | Merged in [PR #151](https://github.com/RyoTsushigawa/anime-schedule/pull/151). |
| U21 | Synopsis Quiz Daily Archive | Merged in [PR #168](https://github.com/RyoTsushigawa/anime-schedule/pull/168). |
| U23 | Synopsis Quiz Statistics | Merged in [PR #168](https://github.com/RyoTsushigawa/anime-schedule/pull/168). |
| U25 | Catch-up Pinned Anime | Merged in [PR #168](https://github.com/RyoTsushigawa/anime-schedule/pull/168). |
| U27 | Season Preview · Next Unvoted Show | Merged in [PR #166](https://github.com/RyoTsushigawa/anime-schedule/pull/166). After a vote saves, offer to jump to the next unvoted show for the selected voter and show how many are left. |
| U29 | Absences · Filter by Person | Merged in [PR #166](https://github.com/RyoTsushigawa/anime-schedule/pull/166). Filter entries in Kalender and Wiederkehrend by person, with an All option. |
| U32 | Weekly Plan · Hide Covers | Merged in [PR #167](https://github.com/RyoTsushigawa/anime-schedule/pull/167). Add a text-only view that keeps times, episode numbers, and watch controls visible. |
| U34 | Discord Schedule · Compact Copy | Merged in [PR #167](https://github.com/RyoTsushigawa/anime-schedule/pull/167). Offer a shorter copy format with start times, titles, and episode numbers. |
| U37 | Season Preview · Remember My Filters | Merged in [PR #166](https://github.com/RyoTsushigawa/anime-schedule/pull/166). Restore the last selected voter and filters. |
| U39 | Weekly Plan · Explain Absence Pauses | Merged in [PR #167](https://github.com/RyoTsushigawa/anime-schedule/pull/167). Open the existing Abwesend badge to see who was unavailable at the scheduled time and why the show was paused. |
| U42 | Season Preview · Save an Unsent Vote | Merged in [PR #166](https://github.com/RyoTsushigawa/anime-schedule/pull/166). Keep a failed vote as a draft on its show so the voter can retry later. |
| U43 | Weekly Plan · Hide Watched Episodes | Approved. Add an on/off toggle in the existing Solo view controls. On hides watched episodes. Off restores the full plan in one click. |
| U44 | Seasonal Anime Awards · Search Nominees | Approved. Make the existing nominee picker searchable by title. |
| U45 | Weekly Plan · Report a Wrong Streaming Link | Done: day menu › Falschen Link melden; reports stored by the votes helper (see workers/season-votes/README.md) for the repair queue N55. Flag incorrect links from the show menu, with an optional replacement URL for the maintainer. |
| U46 | Seasonal Anime Awards · Ballot Progress | Done with the shared voting ([PR #163](https://github.com/RyoTsushigawa/anime-schedule/pull/163)): ✓ chips show who has voted, choices stay secret. |
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
| U62 | Absences · Preview Affected Shows | Approved in a ChatGPT round. (The same idea was not picked in Claude round 7, as U43 there; the ChatGPT approval stands unless the owner says otherwise.) In the existing editor, preview which already-scheduled shows would pause under the group’s attendance rules before saving. |
| U63 | Weekly Plan · Warn When Moving Before Airing | Approved. Flag a proposed slot before the episode’s confirmed release time and show that time in the existing move dialog. |
| U72 | Allein · Catch-up on Release | Merged with the integration of ChatGPT's PRs ([#173](https://github.com/RyoTsushigawa/anime-schedule/pull/173)). Use the existing Sheet choice to send aired, unwatched episodes to personal Catch-up without waiting for the group slot. |
| U66 | Weekly Plan · End Date for a Temporary Move | Approved. Let the temporary slot run through a chosen week and then restore the regular slot automatically. |
| U74 | Watch-Planer · Take Over Absences | Done: Watch-Planer › Feste Termine › Aus Abwesenheiten. Recurring absences (e.g. „Sophie jeden Sa“) are taken over as busy times in the Watch planner instead of being entered by hand. |

| U73 (N80) | Personal Catch-up Planner | Approved. Build on the existing multi-day Nachholen planner and add per-day time budgets around existing watch slots. Use the existing planner entry point. |

## Curation decisions

- The group is about 10 people who (except MaRyo) live far apart and do everything over Discord. Prefer features that help a remote group; skip ideas that assume meeting in person.
- Owner decisions of 13 Nov (to Claude): U38 Time Zone Override scrapped; U41 Remind Me Before a Show, N21 Anime Screenshot Quiz and the Catch-up Quick Actions / Search & Filters updates skipped (Catch-up already has steppers, bulk actions and search).
- Claude rounds 7–10, not picked (names only, their IDs there clash with the list above): Week Plan as Image, Drop Radar, Show Info Card, Group Tier List, Games Leaderboard, Absences · Preview Effects (see U62), Catch-up · Catch Up Together, New Badges, Season Preview · Who Still Votes, List Check · One-Tap Fixes, Season Streaming Overview, Opening/Ending Playlist, Shared Planning List, Anime in Cinemas, Delay Review, Weekly Discord Recap, Episode Threads, Ready Check, Mid-Season Keep/Drop Vote, Missed-Evening Message, Birthdays in the Daily Post, My Overview, Quick Search (Ctrl+K), Wide-Screen View, Phone Bottom Bar, First Steps.
- Require a concrete user benefit for every proposal. Treat 50 as a target and keep the bar for approval consistent.
- Keep the interface clean and easy to understand. Prefer existing entry points and add controls only where they help users complete a task.
- Check current main, open PRs, and approved backlog items for overlapping workflows. Improve an existing feature when it already serves the same purpose.
- Count only approved standalone features toward 50. Keep updates in their own list.
- Preserve the four earlier maybes and the undecided N7–N9. N26 Anime Airing Changes Tracker is a separate maybe.
- Rejected ideas stay excluded, including N27 Season Vote Results Board, U28 Weekly Plan · Estimated Finish Time, N28 Calendar Export, N29 Group Watch Journal, N30 Anime Cast Explorer, N31 New Season Setup Checklist, U30 Season Preview · Mark Trailers Watched, N32 Anime Franchise Guide, N33 Anime Recommendation Inbox, U31 Tier List · Undo Last Move, N34 Guckplan Comparison, N36 Episode Runtime Calculator, N37 Anime Source Material Finder, U33 Weekly Plan · Copy Day Link, N40 Episode Finder, N41 Personal Rating Breakdown, U35 Catch-up · Time per Show, N42 Guckplan Validator, N43 Season Finale Calendar, U36 Weekly Plan · Collapse All Days, N45 Guckplan Backup Browser, U40 Weekly Plan · Jump to a Date, N46 Watch Night Display, N47 Group Watch Progress, U47 Catch-up · Choose How Long to Snooze, U49 Weekly Plan · High-Contrast Labels, U55 Weekly Plan · Pause a Whole Day, U58 Weekly Plan · Jump from an Alert to Its Show, U60 Tier List · Find a Title, U64 Seasonal Anime Awards · Copy My Draft to Another Device, U65 Weekly Plan · Print the Current View, U67 Search · Remove One Recent Search, U68 Weekly Plan · Reason for a Slot Move, U69 Season Preview · Filter by Format, U70 Seasonal Anime Awards · Reset My Draft, N49 Anime Content Warnings, N51 New Member Setup, N53 Sequel Follow List, N54 Make-up Slot Poll, N56 Shared Watch Queue for Finished Shows, N57 Personal Discord Digest, N58 Offline Watch Log, N60 Schedule Edit History, N62 Scheduled Plan Publication, N64 Time-Limited Guest View, N65 Plan Ownership Handoff, N67 Schedule Profiles, N68 Audio and Subtitle Guide, N69 Shared Break Timer, N71 Personal Data Manager, N72 Anime Edition Guide, N76 Personal Watch Goals, N77 Alternate Watch Slot Finder, N78 AniList and MAL List Comparison, N79 Import Absences from a Calendar, N81 Episode Corrections Desk, and N82 Anime List Backup. Keep new game ideas out of future rounds.
- N73 Leave a Group Show was withdrawn because the Sheet already has an Allein option. Its Catch-up behavior is tracked as U72.
- N70 Guckplan Sandbox was withdrawn due to overlap with the Watch planner's Testmodus.
- N52 Personal Rewatch Tracker was withdrawn due to overlap with Non-seasonal and existing rewatch handling.
- For now, curate standalone features only, in batches of five.
- U71 Weekly Plan · Hide Scores was withdrawn. The Weekly Plan does not display public ratings before watching. Personal scoring is available after completion.
- Check current main and open PRs before claiming an item. Update the status here when implementation moves forward.