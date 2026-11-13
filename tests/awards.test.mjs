import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('Awards is linked from the tools menu', () => {
  const { window } = new JSDOM(read('index.html'));
  assert.ok(window.document.querySelector('#miscMenu a[href="awards.html"]'));
  window.close();
});

test('seasonal ballots isolate voters and seasons, persist choices, and share the selected ballot', async t => {
  const dom = new JSDOM(read('awards.html'), {
    url: 'https://schedule.example/awards.html', runScripts: 'outside-only'
  });
  const { window } = dom;
  t.after(() => window.close());
  const { document } = window;
  const byId = id => document.getElementById(id);
  const tabs = [{ gid: '1', name: 'Guckplan Sommer 2026' }, { gid: '2', name: 'Guckplan Herbst 2026' }];
  let completeOldRequest;
  let failLoad = false;
  window.loadTestPlan = tab => {
    if (failLoad) return Promise.reject(new Error('offline'));
    const plan = {
      people: ['Ryo', 'Mia'],
      shows: [{ romaji: 'Alpha', english: 'The Alpha' }, { romaji: 'Hidden', hidden: true }]
    };
    if (tab === tabs[0]) return plan;
    return new Promise(resolve => { completeOldRequest = () => resolve(plan); });
  };
  window.testTabs = tabs;
  window.eval(`
    const $ = id => document.getElementById(id);
    const SHEET_ID = 'test-sheet';
    const norm = value => value.toLowerCase();
    const guckplanTabs = async () => testTabs;
    const tabFor = tabs => tabs[0];
    const loadPlan = async tab => loadTestPlan(tab);
    ${read('awards.js')}
  `);
  const tick = () => new Promise(resolve => setImmediate(resolve));
  await tick();
  const award = () => byId('awardsBallot').querySelector('select');
  const change = (field, value) => {
    field.value = value;
    field.dispatchEvent(new window.Event('change'));
  };
  assert.deepEqual(Array.from(award().options, option => option.text), ['Keine Auswahl', 'The Alpha']);
  change(award(), 'alpha');
  change(byId('awardsPerson'), 'Mia');
  assert.equal(award().value, '');
  change(byId('awardsPerson'), 'Ryo');
  assert.equal(award().value, 'alpha');

  change(byId('awardsSeason'), '2');
  assert.equal(byId('awardsCopy').disabled, true);
  change(byId('awardsSeason'), '1');
  completeOldRequest();
  await tick();
  assert.equal(award().value, 'alpha');

  change(byId('awardsSeason'), '2');
  completeOldRequest();
  await tick();
  assert.equal(award().value, '');
  change(byId('awardsSeason'), '1');
  await tick();
  assert.equal(award().value, 'alpha');

  byId('awardsCopy').click();
  await tick();
  assert.equal(byId('awardsManual').hidden, false);
  assert.match(byId('awardsText').value, /Sommer 2026 · Ryo\nAnime der Season: The Alpha/);
  change(award(), '');
  assert.equal(byId('awardsCopy').disabled, true);
  assert.equal(byId('awardsManual').hidden, true);

  failLoad = true;
  change(byId('awardsSeason'), '2');
  await tick();
  assert.equal(award(), null);
  assert.match(byId('awardsStatus').textContent, /konnte nicht geladen werden/);
});
