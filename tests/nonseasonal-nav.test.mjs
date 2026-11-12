import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openPage } from './harness.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app-catchup.js', import.meta.url), 'utf8');
const start = readFileSync(new URL('../app-start.js', import.meta.url), 'utf8');

test('time plan, absences and Catch-up remain one-click navigation actions', () => {
  assert.match(html, /id="awayButton"[^>]*aria-label="Abwesenheiten"/);
  assert.match(html, /id="viewWeek">Zeitplan<\/button>/);
  assert.match(html, /id="viewCatchup">Catch-up/);
  assert.match(html, /id="viewPace"[^>]*>Non-seasonal<\/button>/);
});

test('Non-seasonal hides when a verified person has no older unwatched shows', async () => {
  const p = await openPage({ storage: {
    anilistAccounts: JSON.stringify([{name:'Tester',token:'fixture-only'}]),
    anilistActive:'Tester', anilistUser:'Tester'
  }, list: { 1: { status:'CURRENT', progress:0 } } });
  try {
    await p.run('refreshPaceNav()');
    assert.equal(p.$('viewPace').hidden, true);
    assert.equal(p.$('viewCatchup').hidden, false);
    assert.equal(p.$('viewWeek').hidden, false);
    assert.equal(p.$('awayButton').hidden, false);
  } finally { p.close(); }
});

test('Non-seasonal remains reachable when an older series has open episodes', async () => {
  const p = await openPage({ storage: {
    anilistAccounts: JSON.stringify([{name:'Tester',token:'fixture-only'}]),
    anilistActive:'Tester', anilistUser:'Tester'
  }, list: {4:{status:'CURRENT',progress:2}}, listNext:{4:null},
  media:{4:{status:'FINISHED',episodes:12,startDate:{year:2019,month:4,day:1}}} });
  try {
    await p.run('refreshPaceNav()');
    assert.equal(p.$('viewPace').hidden,false);
  } finally { p.close(); }
});

test('active Non-seasonal never removes its own navigation while rendering', async () => {
  const p = await openPage();
  try {
    p.run("setView('pace'); setPaceNav(0)");
    assert.equal(p.$('viewPace').hidden,false);
    await p.run("setView('week'); setPaceNav(0); refreshPaceNav()");
    p.run('setPaceNav(0)');
    assert.equal(p.$('viewPace').hidden,true);
  } finally { p.close(); }
});

test('selected profile and slow responses cannot hide another person\'s tab', () => {
  assert.match(app,/generation === paceNavGeneration && view === 'week'/);
  assert.match(app,/soloPerson === person && auth === account/);
  assert.match(app,/friendList\.value === friend && listUser\(\) === user/);
  assert.match(start,/soloPerson = \$\('soloPerson'\)\.value;\s*syncListToSolo\(\);\s*refreshPaceNav\(\)/);
});
