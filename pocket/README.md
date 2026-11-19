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

Cards are identified by set and number (`A1-25`), so the language a card is in doesn't matter.

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
