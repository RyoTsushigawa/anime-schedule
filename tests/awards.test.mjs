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
      shows: [{ romaji: 'Alpha', english: 'The Alpha' }, { romaji: 'Beta', english: 'Beta EN' }, { romaji: 'Hidden', hidden: true }]
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
  const place = (category, i = 0) => byId('awardsBallot').querySelectorAll(`[data-category="${category}"] input`)[i];
  const change = (field, value) => {
    field.value = value;
    field.dispatchEvent(new window.Event('change'));
  };
  // 22 categories in groups, three places each; the choices are the visible shows
  assert.equal(byId('awardsBallot').querySelectorAll('fieldset').length, 22);
  assert.equal(byId('awardsBallot').querySelectorAll('[data-category="best"] .awards-points').length, 3);
  assert.deepEqual([...byId('awardsList-show').options].map(o => o.value), ['Beta EN', 'The Alpha']);
  change(place('best'), 'The Alpha');
  // not in the list, or already on another place: not taken
  change(place('best', 1), 'Nope');
  assert.ok(place('best', 1).classList.contains('bad'));
  change(place('best', 1), 'The Alpha');
  assert.ok(place('best', 1).classList.contains('bad'));
  change(place('best', 1), 'Beta EN');
  assert.ok(!place('best', 1).classList.contains('bad'));
  assert.match(byId('awardsProgress').textContent, /1 von 22/);
  change(byId('awardsPerson'), 'Mia');
  assert.equal(place('best').value, '');
  change(byId('awardsPerson'), 'Ryo');
  assert.equal(place('best').value, 'The Alpha');

  change(byId('awardsSeason'), '2');
  assert.equal(byId('awardsCopy').disabled, true);
  change(byId('awardsSeason'), '1');
  completeOldRequest();
  await tick();
  assert.equal(place('best').value, 'The Alpha');

  change(byId('awardsSeason'), '2');
  completeOldRequest();
  await tick();
  assert.equal(place('best').value, '');
  change(byId('awardsSeason'), '1');
  await tick();
  assert.equal(place('best', 1).value, 'Beta EN');

  byId('awardsCopy').click();
  await tick();
  assert.equal(byId('awardsManual').hidden, false);
  assert.match(byId('awardsText').value, /Sommer 2026 · Ryo\nAnime der Season: 12 The Alpha · 10 Beta EN/);
  change(place('best'), '');
  change(place('best', 1), '');
  assert.equal(byId('awardsCopy').disabled, true);
  assert.equal(byId('awardsManual').hidden, true);

  failLoad = true;
  change(byId('awardsSeason'), '2');
  await tick();
  assert.equal(place('best'), undefined);
  assert.match(byId('awardsStatus').textContent, /konnte nicht geladen werden/);
});

test('shared voting: who voted shows before Auflösen; then the Eurovision show and the points', async t => {
  const dom = new JSDOM(read('awards.html'), { url: 'https://schedule.example/awards.html', runScripts: 'outside-only' });
  const { window } = dom;
  t.after(() => window.close());
  const { document } = window;
  const byId = id => document.getElementById(id);
  // a tiny votes helper: ballots stay here until reveal; Ceddl candidates are collected
  const ballots = new Map(); let open = true; const calls = []; let ceddl = [];
  window.fetch = async (url, options = {}) => {
    const u = new URL(url, 'https://schedule.example/'); calls.push((options.method || 'GET') + ' ' + u.pathname);
    const reply = data => ({ ok: true, status: 200, json: async () => data });
    if (u.host !== 'votes.test') return { ok: false, status: 404, json: async () => ({}) };
    if (u.pathname === '/awards') return reply({ season: u.searchParams.get('season'), revealed: !open, voters: [...ballots.keys()],
      ...(!open && { ballots: [...ballots.values()] }) });
    if (u.pathname === '/awards/ceddl' && !options.body) return reply({ candidates: ceddl });
    const body = JSON.parse(options.body);
    if (u.pathname === '/awards/ceddl') { ceddl = [...ceddl, { id: 'c' + ceddl.length, name: body.name, anime: body.anime, by: body.by }]; return reply({ ok: true, candidates: ceddl }); }
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
    const loadPlan = async () => ({ people: ['MaRyo', 'Mia', 'Rei'], shows: [{ romaji: 'Alpha', english: 'The Alpha' }, { romaji: 'Beta', english: 'Beta EN' }, { romaji: 'Gamma', english: 'Gamma EN' }] });
    ${read('awards.js')}
  `);
  const tick = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };
  await tick();
  const place = (category, i = 0) => byId('awardsBallot').querySelectorAll(`[data-category="${category}"] input`)[i];
  const vote = async (person, picks) => {
    byId('awardsPerson').value = person; byId('awardsPerson').dispatchEvent(new window.Event('change'));
    picks.forEach((value, i) => { place('best', i).value = value; place('best', i).dispatchEvent(new window.Event('change')); });
    byId('awardsSubmit').click(); await tick();
  };
  assert.equal(byId('awardsGroup').hidden, false);
  assert.equal(byId('awardsReveal').disabled, true);
  // the shared MaRyo column: Marvin and Ryo each vote
  assert.deepEqual([...byId('awardsPerson').options].map(o => o.value), ['Marvin', 'Ryo', 'Mia', 'Rei']);
  // Ceddl of the Year: a candidate collected now can get points later
  assert.equal(byId('awardsCeddl').hidden, false);
  byId('awardsCeddlName').value = 'Anya Forger'; byId('awardsCeddlAnime').value = 'Spy x Family';
  byId('awardsCeddlAdd').click(); await tick();
  assert.match(byId('awardsCeddlList').textContent, /Anya Forger/);
  assert.deepEqual([...byId('awardsList-ceddl').options].map(o => o.value), ['Anya Forger (Spy x Family)']);
  await vote('Marvin', ['The Alpha', 'Beta EN', 'Gamma EN']);
  await vote('Ryo', ['The Alpha', 'Gamma EN']);
  await vote('Mia', ['Beta EN', 'The Alpha']);
  await vote('Rei', ['Beta EN']);
  assert.match(byId('awardsStatus').textContent, /Rei abgegeben/);
  assert.deepEqual(ballots.get('Ryo').picks, { best: ['The Alpha', 'Gamma EN'] });
  assert.match(byId('awardsGroup').textContent, /✓ Marvin.*✓ Ryo.*✓ Mia.*✓ Rei/s);
  assert.equal(byId('awardsResults').hidden, true);
  byId('awardsReveal').click(); await tick();
  assert.equal(byId('awardsResults').hidden, false);
  assert.equal(byId('awardsBallot').hidden, true);
  assert.equal(byId('awardsCeddl').hidden, true);
  // points: The Alpha 12+12+10 = 34, Beta EN 10+12+12 = 34, Gamma 8+10 = 18; the tie: both have two 12s and
  // one 10, so A–Z decides
  const best = [...byId('awardsResultGrid').querySelectorAll('.awards-result')].find(c => /Anime der Season/.test(c.textContent));
  assert.deepEqual([...best.querySelectorAll('li')].map(li => li.textContent), ['Beta EN34 Punkte', 'The Alpha34 Punkte', 'Gamma EN18 Punkte']);
  assert.match(byId('awardsBallotsList').textContent, /Rei: Anime der Season 12 Beta EN/);
  // the show: "Anime der Season" is last; step through it voter by voter
  const pick = byId('awardsShowPick');
  pick.value = String([...pick.options].findIndex(o => o.text === 'Anime der Season'));
  pick.dispatchEvent(new window.Event('change'));
  assert.equal(pick.options[pick.options.length - 1].text, 'Anime der Season');
  assert.match(byId('awardsShowLine').textContent, /Gleich geht es los/);
  const steps = 3 + 2 + 2 + 1;
  for (let i = 0; i < steps; i++) byId('awardsShowNext').click();
  assert.match(byId('awardsShowLine').textContent, /12 Punkte|Punkte an/);
  assert.equal(byId('awardsShowBoard').querySelectorAll('li').length, 3);
  assert.ok(byId('awardsShowBoard').querySelector('li.winner'));
  assert.equal(byId('awardsShowNext').textContent, 'Fertig');
  assert.ok(calls.includes('POST /awards/reveal'));
});

test('N84 Ruhmeshalle: only revealed seasons, their winners, and who picked winners most', async t => {
  const dom = new JSDOM(read('awards.html'), { url: 'https://schedule.example/awards.html', runScripts: 'outside-only' });
  const { window } = dom;
  t.after(() => window.close());
  const byId = id => window.document.getElementById(id);
  const data = {
    'Herbst 2026': { revealed: true, voters: ['Ryo', 'Mia', 'Rei'], ballots: [
      { person: 'Ryo', picks: { best: 'Frieren', opening: 'Dandadan' } },
      { person: 'Mia', picks: { best: 'Frieren', opening: 'Gachiakuta' } },
      { person: 'Rei', picks: { best: 'Dandadan', opening: 'Dandadan' } }] },
    'Winter 2027': { revealed: false, voters: ['Ryo'] },
  };
  window.fetch = async url => ({ ok: true, status: 200, json: async () => data[new URL(url).searchParams.get('season')] || { revealed: false, voters: [] } });
  window.eval(`
    const $ = id => document.getElementById(id);
    const SHEET_ID = 'test-sheet';
    const norm = value => value.toLowerCase();
    const config = async () => ({ previewVotesUrl: 'https://votes.test/' });
    const guckplanTabs = async () => [{ gid: '3', name: 'Guckplan Winter 2027' }, { gid: '2', name: 'Guckplan Herbst 2026' }];
    const tabFor = tabs => tabs[0];
    const loadPlan = async () => ({ people: ['Ryo', 'Mia', 'Rei'], shows: [{ romaji: 'Frieren', english: 'Frieren' }] });
    ${read('awards.js')}
  `);
  const tick = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };
  await tick();
  const hall = byId('awardsHall');
  assert.equal(hall.hidden, false);
  hall.open = true; hall.dispatchEvent(new window.Event('toggle'));
  await tick();
  const seasons = [...byId('awardsHallBody').querySelectorAll('.awards-hall-season h3')].map(h => h.textContent);
  assert.deepEqual(seasons, ['Herbst 2026']);
  assert.match(byId('awardsHallBody').textContent, /Anime der Season\s*Frieren/);
  assert.match(byId('awardsHallBody').textContent, /Bestes Opening\s*Dandadan/);
  assert.match(byId('awardsHallBody').querySelector('.awards-hall-note').textContent, /Ryo \(2\), Mia \(1\), Rei \(1\)/);
});

test('only for yourself: your AniList login picks and confirms you; without AniList a PIN; the proof goes along', async t => {
  const dom = new JSDOM(read('awards.html'), { url: 'https://schedule.example/awards.html', runScripts: 'outside-only' });
  const { window } = dom;
  t.after(() => window.close());
  const byId = id => window.document.getElementById(id);
  window.localStorage.setItem('anilistAccounts', JSON.stringify([{ name: 'RyoTsushigawa', token: 'ryo-token' }]));
  const sent = [];
  window.fetch = async (url, options = {}) => {
    const u = new URL(url, 'https://schedule.example/');
    const reply = data => ({ ok: true, status: 200, json: async () => data });
    if (u.pathname.endsWith('wrapped-profiles.json')) return reply({ MaRyo: [{ provider: 'anilist', name: 'RyoTsushigawa' }, { provider: 'anilist', name: 'MilkyWay95' }] });
    if (u.host !== 'votes.test') return { ok: false, status: 404, json: async () => ({}) };
    if (u.pathname === '/awards') return reply({ revealed: false, voters: [] });
    if (u.pathname === '/awards/ceddl') return reply({ candidates: [] });
    if (u.pathname === '/awards/ballot') { sent.push({ person: JSON.parse(options.body).person, headers: options.headers }); return reply({ ok: true }); }
    throw Error('unexpected ' + url);
  };
  window.eval(`
    const $ = id => document.getElementById(id);
    const SHEET_ID = 'test-sheet';
    const norm = value => value.toLowerCase();
    const config = async () => ({ previewVotesUrl: 'https://votes.test/' });
    const guckplanTabs = async () => [{ gid: '2', name: 'Guckplan Herbst 2026' }];
    const tabFor = tabs => tabs[0];
    const loadPlan = async () => ({ people: ['MaRyo', 'Rei'], shows: [{ romaji: 'Alpha', english: 'The Alpha' }] });
    ${read('identity.js')}
    ${read('awards.js')}
  `);
  const tick = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r)); };
  await tick();
  assert.equal(byId('awardsPerson').value, 'Ryo', 'your own name first');
  assert.match(byId('awardsIdentity').textContent, /Ryo, bestätigt über AniList \(RyoTsushigawa\)/);
  const best = byId('awardsBallot').querySelector('[data-category="best"] input');
  best.value = 'The Alpha'; best.dispatchEvent(new window.Event('change'));
  byId('awardsSubmit').click(); await tick();
  assert.deepEqual(sent.map(s => [s.person, s.headers['X-AniList-Token']]), [['Ryo', 'ryo-token']]);
  // Marvin's account isn't in this browser: connect AniList, no PIN
  byId('awardsPerson').value = 'Marvin'; byId('awardsPerson').dispatchEvent(new window.Event('change')); await tick();
  assert.match(byId('awardsIdentity').textContent, /Marvin meldet sich mit AniList an.*milkyway95/);
  assert.equal(byId('awardsSubmit').disabled, true);
  // Rei has no AniList: a PIN
  byId('awardsPerson').value = 'Rei'; byId('awardsPerson').dispatchEvent(new window.Event('change')); await tick();
  const pin = byId('awardsIdentity').querySelector('input[type="password"]');
  assert.ok(pin);
  const b2 = byId('awardsBallot').querySelector('[data-category="best"] input');
  b2.value = 'The Alpha'; b2.dispatchEvent(new window.Event('change'));
  assert.equal(byId('awardsSubmit').disabled, true, 'not before the PIN');
  pin.value = 'rei-pin'; byId('awardsIdentity').querySelector('button').click(); await tick();
  assert.match(byId('awardsIdentity').textContent, /PIN für Rei ist für diese Sitzung gemerkt/);
  assert.equal(byId('awardsSubmit').disabled, false);
  byId('awardsSubmit').click(); await tick();
  assert.deepEqual(sent.at(-1), { person: 'Rei', headers: sent.at(-1).headers });
  assert.equal(sent.at(-1).headers['X-Person-Pin'], 'rei-pin');
  assert.equal(sent.at(-1).headers['X-AniList-Token'], undefined);
});
