# Simulcast Schedule

Weekly anime schedule for the Guckplan group: shows the episodes each person watches, on the day they're watched,
with buttons for the legal streaming services in Germany.

- **The Guckplan** comes live from the group's Google Sheet (tabs named `Guckplan <Winter|Frühling|Sommer|Herbst> <Year>`).
  The page only reads the sheet, never writes to it. Each episode uses the tab its air date belongs to.
- **Airing times** come live from AniList.
- **German streams** come from LiveChart.me and are saved in `streams-de.json` once a week, together with
  release times on our services, each show's next episode and recent break/delay headlines.
- Shows without an episode that week appear as **Pause** (back date + announcement) when LiveChart has a
  later episode; older shows in the plan that AniList lists as finished appear as **Rewatch** in their slot.
- **Catch-up** view: everything on an AniList "Watching" list with episodes out but not yet watched.
- **Connect AniList** (optional, per browser): the ✓ next to an episode sets your AniList progress. Uses the
  AniList API client 54702 (redirect URL `https://ryotsushigawa.github.io/anime-schedule/`); the login key
  only stays in that browser, so it only works on the live page, not a local copy. Several accounts can be
  kept in one browser (shared PC): the account menu in the header switches between them, adds one or logs out.
- Each day is sorted by watch time (the sheet's "Uhrzeit", otherwise 19:00, 19:30, …); times before 06:00
  count as that night.

## Files

| File | What it is |
|---|---|
| `index.html` | The whole page |
| `streams-de.json` | Where each Guckplan show streams in Germany (from LiveChart) |
| `tools/build-streams.mjs` | Rebuilds `streams-de.json` (about 7 minutes; must run from Germany) |
| `tools/publish.mjs` | Uploads `index.html`, `streams-de.json` and this README to GitHub |

## Weekly refresh

A Windows scheduled task, **Anime Schedule - German streams**, runs both scripts every Monday at 05:00
(or the next time the PC is on) without opening a window. The output is in `tools/last-run.log`.
It runs on this PC rather than on GitHub because LiveChart shows the streams for the visitor's country,
and GitHub's servers are in the US.

## Putting it online (one time)

1. On GitHub, create a new **public** repository named `anime-schedule` (leave it empty).
2. Create a token at **GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token**:
   - Repository access: **Only select repositories** → `anime-schedule`
   - Permissions → Repository permissions → **Contents: Read and write**
   - Pick a long expiration (you'll need a new token when it runs out).
3. Paste the token into a new file `tools/github-token.txt`. It stays on this PC and is never uploaded.
4. Upload everything once: in Windows' Task Scheduler, right-click **Anime Schedule - German streams** → **Run**,
   or run `node tools/build-streams.mjs` and then `node tools/publish.mjs` in this folder.
5. In the repository: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
6. After a minute the page is at `https://ryotsushigawa.github.io/anime-schedule/`.

Changes to the page made on this PC are uploaded by the next weekly run, or right away with `node tools/publish.mjs`.

## Trying it locally

Open it through a small web server (browsers block `fetch()` from `file://`), for example `npx serve .` in this folder.
