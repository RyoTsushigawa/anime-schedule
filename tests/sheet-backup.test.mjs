import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { backup, tabsFromHtml, fileName } from '../tools/sheet-backup.mjs';

const html = 'x {name: "Guckplan Herbst 2026", pageUrl: "https://x/?gid=1"} {name: "Herbst 2026", pageUrl: "https://x/?gid=2"} {name: "Season\\u00e4/Notizen", pageUrl: "https://x/?gid=3"}';
const fakeFetch = (fail = '') => async url => {
  const u = String(url);
  if (u.endsWith('/htmlview')) return new Response(html);
  if (fail && u.includes('gid=' + fail)) return new Response('', { status: 500 });
  if (u.includes('export?format=csv')) return new Response('Anime Titel,Tag\nFrieren,Fr.');
  if (u.includes('ranges=')) return Response.json({ sheets: [{ properties: { sheetId: 1 }, data: [{ rowData: [{ values: [{ formattedValue: 'Anime Titel' }, { formattedValue: 'Blue', effectiveFormat: { backgroundColor: { red: 0, green: 0, blue: 1 } } }] }] }] }] });
  if (u.includes('sheets.googleapis.com')) return Response.json({ sheets: [{ properties: { sheetId: 1 }, data: [{ rowMetadata: [{}, { hiddenByUser: true }], columnMetadata: [] }] }] });
  return new Response('', { status: 404 });
};
const tempDir = async () => pathToFileURL(await mkdtemp(join(tmpdir(), 'sheet-')) + '/');

test('reads every tab, with escaped names and safe file names', () => {
  assert.deepEqual(tabsFromHtml(html).map(t => t.name), ['Guckplan Herbst 2026', 'Herbst 2026', 'Seasonä/Notizen']);
  assert.equal(fileName('Seasonä/Notizen'), 'Seasonä_Notizen.csv');
});
test('writes a CSV per tab and an index with hidden rows and person colours', async () => {
  const dir = await tempDir();
  await backup({ fetch: fakeFetch(), dir, key: 'k' });
  assert.deepEqual((await readdir(dir)).sort(), ['Guckplan Herbst 2026.csv', 'Herbst 2026.csv', 'Seasonä_Notizen.csv', 'index.json']);
  const index = JSON.parse(await readFile(new URL('index.json', dir), 'utf8'));
  assert.deepEqual(index.tabs[0].hiddenRows, [2]);
  assert.deepEqual(index.tabs[0].colors, { Blue: '#0000ff' });
  assert.equal(await readFile(new URL('Herbst 2026.csv', dir), 'utf8'), 'Anime Titel,Tag\nFrieren,Fr.\n');
});
test('a failed tab download writes nothing', async () => {
  const dir = await tempDir();
  await assert.rejects(backup({ fetch: fakeFetch('2'), dir, key: '' }), /Herbst 2026/);
  assert.deepEqual(await readdir(dir), []);
});
