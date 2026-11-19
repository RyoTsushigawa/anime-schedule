import test from 'node:test';
import assert from 'node:assert/strict';
import { parseZoneCsv, previewZoneImport } from '../pocket/zone-import.mjs';

const ids = new Set(['A1-1', 'A1-25', 'A4b-2']);
test('parses Pokémon Zone Exporter CSV with BOM, quoted names and zeros', () => {
  const csv = '\uFEFFId,CardName,InternalId,NumberOwned,Expansion,Pack,Rarity,Collected\r\nA1-001,"Pikachu, ex",12,2,A1,all,star,TRUE\r\nA4b-2,Other,13,0,A4b,all,star,FALSE\r\n';
  const result = parseZoneCsv(csv, ids);
  assert.deepEqual([...result.owned], [['A1-1', 2], ['A4b-2', 0]]);
  assert.deepEqual(result.unknown, []);
});
test('rejects malformed counts and duplicate card IDs', () => {
  const r = parseZoneCsv('Id,NumberOwned\nA1-1,3\nA1-1,5\nA1-25,-1\nA9-1,1\n', ids);
  assert.equal(r.invalid.length, 2);
  assert.deepEqual(r.unknown, ['A9-1']);
});
test('merge does not delete absent cards, replace does', () => {
  const current = {'A1-1': 2, 'A1-25': 3};
  const imported = new Map([['A1-1', 1]]);
  assert.deepEqual(previewZoneImport(current, imported), [{id:'A1-1', before:2, after:1}]);
  assert.equal(previewZoneImport(current, imported, true).length, 2);
});
test('requires supported exporter headers', () => {
  assert.throws(() => parseZoneCsv('name,count\nPikachu,2', ids));
});
