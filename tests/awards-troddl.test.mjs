import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
// Awards: your own Troddl score as a hint in the dropdowns ("The Alpha (du: 88)"), only for you once confirmed
async function page(t, { confirmed = true } = {}) {
  const dom = new JSDOM(read('awards.html'), { url: 'https://schedule.example/awards.html', runScripts: 'outside-only' });
  const { window } = dom; t.after(() => window.close());
  const asked = [];
  window.fetch = async (url, opts = {}) => {
    const u = new URL(url, 'https://schedule.example/'), reply = data => ({ ok: true, status: 200, json: async () => data });
    if (u.pathname.endsWith('streams-de.json')) return reply({ status: { 101: { titles: ['Alpha', 'The Alpha'] }, 102: { titles: ['Beta', 'Beta EN'] } } });
    if (u.host === 'votes.test' && u.pathname === '/troddl') {
      asked.push(u.searchParams.get('person') + '|' + (opts.headers?.['X-AniList-Token'] || ''));
      return reply({ reviews: [{ mediaId: 101, score: 88, mine: true }, { mediaId: 102, score: 40 }] });
    }
    if (u.host === 'votes.test') return reply({ season: 'Herbst 2026', revealed: false, voters: [], candidates: [] });
    return { ok: false, status: 404, json: async () => ({}) };
  };
  window.eval(`
    const $ = id => document.getElementById(id);
    const SHEET_ID = 'test-sheet';
    const norm = value => value.toLowerCase();
    const config = async () => ({ previewVotesUrl: 'https://votes.test/' });
    const savedGroupCode = () => 'group-code-1234567890';
    const Identity = { ready: Promise.resolve(), canAct: () => ${confirmed}, headers: () => ({ 'X-AniList-Token': 'tok' }), myPeople: () => ['Mia'],
      draw() {}, askGroupCode() {}, accountsOf: () => [] };
    const guckplanTabs = async () => [{ gid: '2', name: 'Guckplan Herbst 2026' }];
    const tabFor = tabs => tabs[0];
    const loadPlan = async () => ({ people: ['Mia'], shows: [{ romaji: 'Alpha', english: 'The Alpha' }, { romaji: 'Beta', english: 'Beta EN' }] });
    ${read('awards.js')}
  `);
  for (let i = 0; i < 30; i++) await new Promise(r => setImmediate(r));
  return { doc: window.document, asked };
}
test('confirmed: your own score next to the show; the value stays the plain title; others\' scores not shown', async t => {
  const { doc, asked } = await page(t);
  assert.deepEqual(asked, ['Mia|tok']);
  const options = [...doc.querySelector('[data-category="best"] .awards-place select').options].slice(1);
  assert.deepEqual(options.map(o => [o.textContent, o.value]).sort(), [['Beta EN', 'Beta EN'], ['The Alpha (du: 88)', 'The Alpha']]);
});
test('not confirmed: nothing is asked, no hints', async t => {
  const { doc, asked } = await page(t, { confirmed: false });
  assert.deepEqual(asked, []);
  assert.ok(![...doc.querySelectorAll('.awards-place option')].some(o => /du:/.test(o.textContent)));
});
