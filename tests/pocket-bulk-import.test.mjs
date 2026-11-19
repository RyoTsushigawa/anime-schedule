import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBulkCards } from '../pocket/bulk-import.mjs';
const ids = new Set(['A1-1','A1-2','A1-3','A4b-1']);
test('bulk entry handles counts, ranges and mixed-case sets', () => {
  const result = parseBulkCards('A1-1 2\nA1: 2-3\nA4B-1=4', ids);
  assert.deepEqual([...result.owned], [['A1-1',2],['A1-2',1],['A1-3',1],['A4b-1',4]]);
  assert.deepEqual(result.invalid, []);
});
test('duplicates and unknown IDs are surfaced', () => {
  const result = parseBulkCards('A1-1\nA1-1 3\nA9-99 2', ids);
  assert.deepEqual(result.invalid,[2]);
  assert.deepEqual(result.unknown,['A9-99']);
});
test('invalid ranges are rejected', () => {
  const result = parseBulkCards('A1: 10-1\nA1: 1-10000', ids);
  assert.deepEqual(result.invalid,[1,2]);
});
