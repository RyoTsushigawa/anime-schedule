# Anime Schedule implementation guide

This is the proposed order for the approved work tracked in [PR #159](https://github.com/RyoTsushigawa/anime-schedule/pull/159). Match items by **title** when comparing backlog branches. [PR #176](https://github.com/RyoTsushigawa/anime-schedule/pull/176) uses some of the same IDs for different proposals and records a different rollout preference. Keep those decisions visible and confirm scope before starting an item whose approval or rollout is disputed.

## Current reviews

- **Linked Account Troubleshooter** — [PR #175](https://github.com/RyoTsushigawa/anime-schedule/pull/175). Review the read-only login, Guckplan mapping, and live list checks.
- **Allein · Catch-up on Release** — [PR #173](https://github.com/RyoTsushigawa/anime-schedule/pull/173). Verify that an aired episode becomes eligible before the group slot.
- **Seasonal AniList titles in Tier List** — [PR #171](https://github.com/RyoTsushigawa/anime-schedule/pull/171).
- **Distinct Anime Wrapped recipes** — [PR #170](https://github.com/RyoTsushigawa/anime-schedule/pull/170).

## Proposed work order

1. **Plan Issue Diagnostic Report** — In review in [PR #179](https://github.com/RyoTsushigawa/anime-schedule/pull/179). The existing day menu opens a show picker and a copyable report with known title IDs, data source, and freshness. Leave unknown values explicit and keep credentials, account names, and watch progress out. This can be reviewed independently and later attached to a repair report.
2. **Upcoming Plan Readiness** — In review in [PR #180](https://github.com/RyoTsushigawa/anime-schedule/pull/180). Add a view of sessions in the next seven days that need a decision. Reuse existing schedule and attendance logic, and link to the relevant editor. Use the existing alert area as the entry point.
3. **Personal Schedule Change Inbox** — In review in [PR #181](https://github.com/RyoTsushigawa/anime-schedule/pull/181). Uses the existing schedule renderer. Compare snapshots for the selected person and show moves, pauses, and additions. Treat the first visit as the baseline. A failed or cached refresh should never make a show look newly removed.
4. **Report a Wrong Streaming Link + Maintainer Repair Queue** — Claude is building the report action. Review its data contract before implementing the queue. Keep suggestions pending until a maintainer verifies them, and track resolution in the queue.
5. **Episode Number Crosswalk** — Initial version in review in [PR #182](https://github.com/RyoTsushigawa/anime-schedule/pull/182). AniList to Guckplan works for the one confirmed mapping. MAL and streaming mappings still need verified data. Display the service, Guckplan, AniList, and MAL numbering where available. Leave missing mappings explicit.

## Parallel work

- **Suggested for Claude: AniList ↔ MyAnimeList Transfer Assistant, preview first.** Match entries by verified provider IDs. Show additions, conflicts, and unmatched shows. Add explicit selection and writes in a follow-up, with per-entry results and a retry path.
- **Guckplan Editor Access** needs a server-side permission design before implementation. Scope grants to the allowed actions and verify revocation and denied writes.
- **Discord Delivery Queue** starts with [PR #183](https://github.com/RyoTsushigawa/anime-schedule/pull/183), which blocks repeat sends for recorded posts. Next, add persistent delivery attempts and reconcile uncertain outcomes before offering retries.

For each item, check current main and open PRs, record the owner or branch in the shared backlog, and use the existing UI entry point where possible. Keep the PR focused on one workflow and verify it through that entry point before marking it ready.