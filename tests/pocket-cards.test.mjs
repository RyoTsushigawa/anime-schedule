import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, sane, germanName, speciesTranslator } from '../pocket/tools/build-cards.mjs';

const source = {
  sets: { A: [{ code: 'A1', releaseDate: '2024-10-30', count: 2, name: { en: 'Genetic Apex', de: 'Unschlagbare Gene' }, packs: ['Mewtwo'] }], P: [{ code: 'PROMO-A', releaseDate: '2024-10-30', name: { en: 'Promo A' }, packs: ['Vol. 1'] }] },
  cards: [{ set: 'A1', number: 2, rarity: 'C', name: 'Mega Dragonite ex', packs: ['Mewtwo'] }, { set: 'A1', number: 1, rarity: 'C', name: 'Bulbasaur', packs: ['Mewtwo'] },
    { set: 'PROMO-A', number: 1, rarity: 'C', name: 'Alolan Exeggutor' }, { set: 'ZZ', number: 1, rarity: 'C', name: 'Unknown set' }, { set: 'A1', number: 3, rarity: 'XX', name: 'Unknown rarity' }],
  rarities: { C: { label: 'Common', group: 'Diamond', count: 1, tradeable: true, tradePrice: 0 } },
  pullRates: { A1: {} },
};

test('cards get a language-free id, a German name where known, and stay in set order', () => {
  const translate = speciesTranslator([{ en: 'Dragonite', de: 'Dragoran' }, { en: 'Exeggutor', de: 'Kokowei' }, { en: 'Pikachu', de: 'Pikachu' }]);
  const out = build(source, { german: new Map([['A1-1', 'Bisasam']]), translate });
  assert.deepEqual(out.cards.map(c => c.id), ['A1-1', 'A1-2', 'PROMO-A-1']);
  assert.equal(out.cards.find(c => c.id === 'A1-1').de, 'Bisasam');
  assert.equal(out.cards.find(c => c.id === 'A1-2').de, 'Mega Dragoran ex');
  assert.equal(out.cards.find(c => c.id === 'PROMO-A-1').de, 'Alola-Kokowei');
  assert.equal(out.sets[0].name.de, 'Unschlagbare Gene');
  assert.equal(out.sets[1].name.de, 'Promo A');
});

test('the German name is the card name, not an attack name', () => {
  const ts = `const card = { set: Set, name: { en: "Bulbasaur", de: "Bisasam" }, attacks: [{ name: { en: "Vine Whip", de: "Rankenhieb" } }] }`;
  assert.equal(germanName(ts), 'Bisasam');
  assert.equal(germanName('name: { en: "X" }'), '');
});

test('a broken download never replaces a good card list', () => {
  const file = JSON.parse(readFileSync(new URL('../pocket/cards.json', import.meta.url), 'utf8'));
  assert.equal(sane(file, file), '');
  assert.match(sane({ ...file, cards: file.cards.slice(0, 10) }, file), /too few/);
  assert.match(sane({ ...file, cards: file.cards.slice(0, Math.floor(file.cards.length * 0.9)) }, file), /lost/);
  assert.ok(file.cards.every(c => /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)?-\d{1,4}$/.test(c.id)), 'every id fits the Worker\'s card pattern');
});
