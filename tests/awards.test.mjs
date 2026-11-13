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

test('shared voting: who voted shows before Auflösen, the winners after; nothing secret before', async t => {
  const dom = new JSDOM(read('awards.html'), { url: 'https://schedule.example/awards.html', runScripts: 'outside-only' });
  const { window } = dom;
  t.after(() => window.close());
  const { document } = window;
  const byId = id => document.getElementById(id);
  // a tiny votes helper: ballots stay here until reveal
  const ballots = new Map(); let open = true; const calls = [];
  window.fetch = async (url, options = {}) => {
    const u = new URL(url); calls.push(options.method + ' ' + u.pathname);
    const reply = data => ({ ok: true, status: 200, json: async () => data });
    if (u.pathname === '/awards') return reply({ season: u.searchParams.get('season'), revealed: !open, voters: [...ballots.keys()],
      ...(!open && { ballots: [...ballots.values()] }) });
    const body = JSON.parse(options.body);
    if (u.pathname === '/awards/ballot') { ballots.set(body.person, { person: body.person, picks: body.picks }); return reply({ ok: true }); }
    if (u.pathname === '/awards/reveal') { open = false; return reply({ ok: true }); }
    throw Error('unexpected ' + url);
  };
  window.confirm = () => true;
  window.eval(`
    const $ = id => document.getElementById(id);
    const SHEET_ID = 'test-sheet';
    const norm = value => value.toLowerCase();
    const config = async () => ({ previewVotesUrl: 'https://votes.test/' });
    const guckplanTabs = async () => [{ gid: '2', name: 'Guckplan Herbst 2026' }];
    const tabFor = tabs => tabs[0];
    const loadPlan = async () => ({ people: ['Ryo', 'Mia', 'Rei'], shows: [{ romaji: 'Alpha', english: 'The Alpha' }, { romaji: 'Beta', english: 'Beta EN' }] });
    ${read('awards.js')}
  `);
  const tick = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r)); };
  await tick();
  const best = () => byId('awardsBallot').querySelector('select');
  const vote = async (person, value) => {
    byId('awardsPerson').value = person; byId('awardsPerson').dispatchEvent(new window.Event('change'));
    best().value = value; best().dispatchEvent(new window.Event('change'));
    byId('awardsSubmit').click(); await tick();
  };
  assert.equal(byId('awardsGroup').hidden, false);
  assert.equal(byId('awardsReveal').disabled, true);
  await vote('Ryo', 'alpha');
  await vote('Mia', 'alpha');
  await vote('Rei', 'beta');
  assert.match(byId('awardsStatus').textContent, /Rei abgegeben/);
  assert.deepEqual([...ballots.get('Ryo').picks ? Object.entries(ballots.get('Ryo').picks) : []], [['best', 'The Alpha']]);
  assert.match(byId('awardsGroup').textContent, /✓ Ryo.*✓ Mia.*✓ Rei/s);
  assert.equal(byId('awardsResults').hidden, true);
  byId('awardsReveal').click(); await tick();
  assert.equal(byId('awardsResults').hidden, false);
  assert.equal(byId('awardsBallot').hidden, true);
  const first = byId('awardsResults').querySelector('.awards-result');
  assert.match(first.querySelector('li.winner').textContent, /The Alpha.*2 Stimmen/);
  assert.match(byId('awardsResults').textContent, /Rei: Anime der Season Beta EN/);
  assert.ok(calls.includes('POST /awards/reveal'));
});
