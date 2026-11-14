import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';

test('first visit: a short welcome; picking a name shows that person\'s plan; it does not come back', async t => {
  const p = await openPage({ welcome: true });
  t.after(() => p.close());
  await p.settle(400);
  assert.equal(p.$('welcomeDlg').open, true);
  assert.ok(p.$('welcomePerson').options.length >= 2);
  p.$('welcomePerson').value = 'Belly';
  p.$('welcomePerson').dispatchEvent(new p.window.Event('change'));
  assert.equal(p.$('soloPerson').value, 'Belly');
  await p.click(p.$('welcomeDone'), 100);
  assert.equal(p.$('welcomeDlg').open, false);
  assert.equal(p.window.localStorage.getItem('welcomeSeen'), '1');
});

test('people who used the site before never see it; the help shows it again', async t => {
  const p = await openPage({ welcome: true, storage: { tabs: '[]' } });
  t.after(() => p.close());
  await p.settle(400);
  assert.equal(p.$('welcomeDlg').open, false);
  // the "?" next to the name opens the help, "Erste Schritte" the welcome
  await p.click(p.$('headerHelp'), 100);
  assert.equal(p.$('helpDialog').open, true);
  await p.click(p.$('helpWelcome'), 100);
  assert.equal(p.$('helpDialog').open, false);
  assert.equal(p.$('welcomeDlg').open, true);
});
