// Pocket-Sammlung (pocket/): builds pocket/cards.json, every Pokémon TCG Pocket card with its set, number,
// rarity, packs and English/German name, plus the rarities (tradeable? trade cost) and the pull rates per set.
// Source: flibustier/pokemon-tcg-pocket-database (MIT), read from GitHub. German card names come from TCGdex's
// cards-database where it has them (a checkout given as TCGDEX_DIR, optional); otherwise the Pokémon in the
// English name is translated with tools/pokemon-names.json (this folder). Runs daily (.github/workflows/pocket-cards.yml),
// so a new set appears by itself. The file is only written when the data is complete; a failed download keeps
// the last good one.
//   node pocket/tools/build-cards.mjs              (downloads)
//   THUMBS_DIR=dir: flibustier/pokemon-tcg-exchange's public/images/thumbnails; card art missing in pocket/cards/
//   (<set>/<number>.webp) is copied from there, so a new set's pictures arrive with it
//   POCKET_SRC=dir node pocket/tools/build-cards.mjs  (reads sets.json, cards.json, rarities.json, pullRates.json from dir)
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const HERE = new URL('./', import.meta.url), OUT = new URL('../cards.json', import.meta.url);
const BASE = 'https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist/';
const FILES = ['sets', 'cards', 'rarities', 'pullRates'];

async function source(name) {
  if (process.env.POCKET_SRC) return JSON.parse(readFileSync(join(process.env.POCKET_SRC, name + '.json'), 'utf8'));
  const res = await fetch(BASE + name + '.json', { headers: { 'User-Agent': 'pocket-collection-site' } });
  if (!res.ok) throw new Error(name + '.json: ' + res.status);
  return res.json();
}

// TCGdex: "data/Pokémon TCG Pocket/<Set>.ts" has the set id, "<Set>/<number>.ts" the card with its names
export function tcgdexNames(dir) {
  const names = new Map();
  const base = join(dir, 'data', 'Pokémon TCG Pocket');
  if (!existsSync(base)) return names;
  for (const file of readdirSync(base).filter(f => f.endsWith('.ts'))) {
    const id = readFileSync(join(base, file), 'utf8').match(/\bid:\s*["']([^"']+)["']/)?.[1];
    const folder = join(base, file.slice(0, -3));
    if (!id || !existsSync(folder)) continue;
    const set = id.replace(/^P-/, 'PROMO-');
    for (const card of readdirSync(folder).filter(f => /^\d+\.ts$/.test(f))) {
      const de = germanName(readFileSync(join(folder, card), 'utf8'));
      if (de) names.set(set + '-' + Number(card.slice(0, -3)), de);
    }
  }
  return names;
}
// the card's own name block is the first "name: {" (attacks and abilities come later)
export function germanName(text) {
  const block = text.match(/\bname:\s*\{([^}]*)\}/)?.[1] || '';
  const de = block.match(/\bde:\s*(["'])((?:\\.|(?!\1).)*)\1/)?.[2];
  return de ? de.replace(/\\(["'\\])/g, '$1').trim() : '';
}

// "Mega Dragonite ex" → "Mega Dragoran ex": each Pokémon name in the English card name, longest first
export function speciesTranslator(list) {
  const pairs = list.filter(p => p.en && p.de && p.en !== p.de).sort((a, b) => b.en.length - a.en.length);
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = pairs.length ? new RegExp('(^|[^\\p{L}])(' + pairs.map(p => escape(p.en)).join('|') + ')(?=$|[^\\p{L}])', 'gu') : null;
  const map = new Map(pairs.map(p => [p.en, p.de]));
  const forms = [['Alolan', 'Alola'], ['Galarian', 'Galar'], ['Hisuian', 'Hisui'], ['Paldean', 'Paldea']];
  return name => {
    let out = pattern ? name.replace(pattern, (_, before, en) => before + map.get(en)) : name;
    if (out === name) return name;
    for (const [en, de] of forms) out = out.replace(new RegExp('\\b' + en + ' (\\S)', 'g'), de + '-$1');
    return out;
  };
}

export function build({ sets, cards, rarities, pullRates }, { german = new Map(), translate = n => n } = {}) {
  const flat = Object.values(sets).flat();
  const outSets = flat.map(s => ({ code: s.code, release: s.releaseDate, name: { en: s.name?.en || s.code, de: s.name?.de || s.name?.en || s.code }, packs: s.packs || [] }))
    .sort((a, b) => a.release.localeCompare(b.release) || a.code.localeCompare(b.code));
  const known = new Set(outSets.map(s => s.code));
  const outCards = [];
  for (const c of cards) {
    if (!known.has(c.set) || !Number.isInteger(c.number) || !rarities[c.rarity]) continue;
    // the Anomaly Mews of SP1 have no set number (the source counts -1, -2, -3): "SP1-AN-1"
    const id = c.number > 0 ? c.set + '-' + c.number : c.set + '-AN-' + -c.number;
    const de = german.get(id) || translate(c.name);
    outCards.push({ id, s: c.set, n: c.number, r: c.rarity, en: c.name, ...(de !== c.name && { de }), ...(c.packs?.length && { p: c.packs }) });
  }
  const order = new Map(outSets.map((s, i) => [s.code, i]));
  outCards.sort((a, b) => order.get(a.s) - order.get(b.s) || a.n - b.n);
  const outRarities = Object.fromEntries(Object.entries(rarities).map(([k, r]) => [k, { label: r.label, group: r.group, count: r.count ?? 0, tradeable: !!r.tradeable, tradePrice: r.tradePrice ?? null }]));
  return { source: 'flibustier/pokemon-tcg-pocket-database', sets: outSets, rarities: outRarities, pullRates, cards: outCards };
}

// refuse a file that lost cards or sets: a broken download must not empty everyone's tracker
export function sane(next, previous) {
  if (next.cards.length < 1000 || next.sets.length < 10) return 'too few cards or sets';
  if (previous?.cards?.length && next.cards.length < previous.cards.length * 0.95) return 'lost more than 5 % of the cards';
  return '';
}

// copies the picture of every card that has none yet; returns how many were copied and which are still missing
export function copyArt(cards, from, to) {
  let copied = 0; const missing = [];
  for (const c of cards) {
    const file = c.n + '.webp', target = join(to, c.s, file), source = join(from, c.s, file);
    if (existsSync(target)) continue;
    if (from && existsSync(source)) { mkdirSync(join(to, c.s), { recursive: true }); copyFileSync(source, target); copied++; } else missing.push(c.id);
  }
  return { copied, missing };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [sets, cards, rarities, pullRates] = await Promise.all(FILES.map(source));
  const german = process.env.TCGDEX_DIR ? tcgdexNames(process.env.TCGDEX_DIR) : new Map();
  const translate = speciesTranslator(JSON.parse(readFileSync(new URL('pokemon-names.json', HERE), 'utf8')));
  const out = OUT;
  const previous = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
  const next = build({ sets, cards, rarities, pullRates }, { german, translate });
  const art = copyArt(next.cards, process.env.THUMBS_DIR || '', new URL('../cards/', import.meta.url).pathname);
  console.log(`card art: ${art.copied} copied, ${art.missing.length} missing${art.missing.length ? ' (' + art.missing.slice(0, 10).join(', ') + ')' : ''}`);
  const problem = sane(next, previous);
  if (problem) { console.error('cards.json not written: ' + problem); process.exit(1); }
  const { updated, ...before } = previous || {};
  if (JSON.stringify(before) === JSON.stringify(next)) { console.log('cards.json unchanged'); process.exit(0); }
  writeFileSync(out, JSON.stringify({ updated: new Date().toISOString(), ...next }) + '\n');
  console.log(`cards.json: ${next.sets.length} sets, ${next.cards.length} cards, ${german.size} German names from TCGdex`);
}
