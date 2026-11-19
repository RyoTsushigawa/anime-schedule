# Pocket-Sammlung

A Pokémon TCG Pocket tracker for the friend group, in German and English. It is **standalone**: everything it uses is
in this folder (page, styles, theme, card data, settings, backend). The schedule site only links to it under
*Mehr → Sonstiges*.

## What it does

- **Collection** per person with **alternate accounts** (up to 6). Tap a card to add a copy to the chosen account;
  with *Alle Konten* every card shows which account holds how many.
- **Wishlist** (♡) and **chase cards** (★).
- **Progress** per set and rarity, and **which pack to open**: expected new cards per pack, the chance of at least
  one new card, and the chance of a wishlist/chase card. Calculated from the set's pull rates; a brand-new set without
  published rates borrows the newest ones (marked ≈).
- **Trade**: who in the group has duplicates you want and wants your duplicates, per rarity (in-game trades are
  always the same rarity; crown, immersive and promo cards can't be traded). Also cards one of your accounts can
  give another. *Discord-Text kopieren* writes the request; the trade itself is arranged on Discord and done in the game.
- **Trade worth**: how much the group wants a card (chase 3, wishlist 2, missing 1) divided by the others' spare
  copies + 1. Within a rarity, a card gets you any card with a lower worth, and *Dafür bekommst du* lists them.

- **Schnell erfassen** (quick entry, in *Sammlung*): one set on one account, card by card in the game's order. A
  number pad sets the count and moves to the next card (0 = missing, → skip, ← back; number keys and arrows on a
  computer). *Alle fehlenden auf 1* fills a set at once, so only duplicates and missing cards need a tap.
- **Pack geöffnet** (the floating button): the last pack and account are preselected, you tap the cards you
  pulled and it saves by itself once the pack is full; the next pack starts right away, with *Rückgängig* to undo.
- **Getauscht**: in *Tausch*, tap your card and the friend's, then *Getauscht*. The server updates **both**
  collections (on the accounts holding the cards), the friend sees a notice, and either of you can undo it.
- Saving merges: your unsaved changes go on top of a newer copy (another device, or a friend's trade), so nothing is lost.

The game has no way to hand a collection to another site. (Pokémon Zone's sync logs into the player's Nintendo
account through an unofficial connection; that is deliberately not done here.)

Cards are identified by set and number (`A1-25`), so the language a card is in doesn't matter.

## Pokémon Zone CSV import

Open **Sammlung → CSV importieren** after signing in and select one specific account (not **Alle Konten**).
Use a CSV produced by the community [Pokémon Zone Exporter](https://github.com/1Tdd/Pokemon-Zone-Exporter).
The importer recognizes its `Id` and `NumberOwned` columns, matches cards to the local database by set-number,
and previews quantity changes before applying them. The file is parsed in the browser and is not uploaded.
By default, only listed cards are updated to their exported counts; missing rows are left alone.
Optional **replace** also removes cards absent from the export, and is disabled if the file has unknown IDs or invalid rows.
Each person can update only their own collection through the existing PIN-protected save flow.
Wishlist, chase list, other accounts and trade history are not intentionally changed.

**Direct sync investigation (19 Nov 2026):** No documented, authorized Pokémon Zone collection API or OAuth
connection has been verified. The third-party exporter reads Pokémon Zone's already-rendered card list and
generates a local CSV; it does not grant API access. Pokémon Zone's Nintendo-account sync is unofficial
and may conflict with Nintendo's terms. Do not automate Nintendo login, intercept sessions, or collect credentials.
If Pokémon Zone later provides an authorized API or documented user-controlled export, it can be added as
another import source behind the same preview/merge logic.

## Files

| File | |
|---|---|
| `index.html`, `pocket.css`, `theme.js`, `app.mjs` | The page |
| `core.mjs` | The rules (completion, pack odds, trades, worth), no page code |
| `cards.json` | Every card, set, rarity and pull rate. Written by `tools/build-cards.mjs`, daily by `.github/workflows/pocket-cards.yml`, so new sets appear by themselves |
| `cards/<set>/<number>.webp` | The card art (thumbnails), copied in; new cards' art comes with the daily run |
| `tools/pokemon-names.json` | English → German Pokémon names, for cards TCGdex has no German name for yet |
| `config.json` | `api`: the backend's URL. If it changes, change `connect-src` in `index.html` too |
| `worker/` | The backend: a Cloudflare Worker with its own KV storage |

Card data: [flibustier/pokemon-tcg-pocket-database](https://github.com/flibustier/pokemon-tcg-pocket-database) (MIT),
German names from [TCGdex](https://github.com/tcgdex/cards-database), card thumbnails from
[flibustier/pokemon-tcg-exchange](https://github.com/flibustier/pokemon-tcg-exchange), copied in for personal use. Card images belong to
The Pokémon Company, Nintendo, Creatures and GAME FREAK; this is a personal, non-commercial fan project.

## Backend

Each person joins with a name and a PIN (kept on their device; only a salted hash is stored; 5 wrong PINs lock for
15 minutes). Everyone in the group can read all collections; only you can save yours. A save from an older copy
(another device saved meanwhile) is refused and the page reloads the newer one.

Set up once:

1. Repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (already there for the other Worker), and
   optionally `POCKET_GROUP_CODE` (16+ characters; asked once per device) and `POCKET_ADMIN_KEY` (16+ characters;
   resets a forgotten PIN with `POST /pin-reset { person }` and the header `X-Admin-Key`).
2. Run the workflow **Deploy Pocket worker**. It creates the KV namespace `pocket-collection` on the first run.
3. If the Worker's URL isn't `https://pocket-collection.shigeruhagano.workers.dev`, put it in `config.json` and in
   `connect-src` in `index.html`.

Tests: `node --test tests/pocket-*.test.mjs`.

## Mobile / friends without Pokémon Zone

The collection import dialog also offers **Text / Bulk entry**. On a phone, paste one card ID per line (`A1-1`), set a quantity (`A1-1 2` or `A1-2=3`), or add a contiguous set range (`A1: 1-50`). All entries are checked against the card database and previewed before saving. Text mode always merges rather than replacing the whole collection. This is a fallback for friends without a third-party tracker, **not** automatic collection discovery. It cannot infer owned cards from the game. A fully automatic import requires a permitted game/third-party export or API, neither of which has been verified.
