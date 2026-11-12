import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage, NOW } from './harness.mjs';
// Idea 113: a show on the list not continued for three weeks says so in Catch-up; "Später" hides it for two weeks.
const day = 86400;
const settle = () => new Promise(r => setTimeout(r, 30));
const open = () => openPage({ storage: { anilistAccounts: JSON.stringify([{ name: 'Tester', token: 'fixture-only' }]), anilistActive: 'Tester', anilistUser: 'Tester' },
  list: { 1: { status: 'CURRENT', progress: 0, updatedAt: NOW / 1000 - 30 * day }, 2: { status: 'CURRENT', progress: 0, updatedAt: NOW / 1000 - 3 * day } } });
const row = (p, name) => [...p.$('list').querySelectorAll('.row, .catchup-show')].find(r => r.textContent.includes(name));

test('sleeping show: marked, "Später" hides it, the summary brings it back', async () => {
  const p = await open();
  await p.click(p.$('viewCatchup'));
  const alpha = row(p, 'Alpha EN');
  assert.ok(alpha, 'Alpha in Catch-up');
  assert.match(alpha.querySelector('.idle-tag')?.textContent || '', /seit 4 Wochen nicht weitergeschaut/);
  const beta = row(p, 'Beta EN');
  if (beta) assert.equal(beta.querySelector('.idle-tag'), null, 'Beta was continued three days ago');
  await p.click(alpha.querySelector('[data-later]'));
  await settle();
  assert.equal(row(p, 'Alpha EN'), undefined, 'hidden after "Später"');
  const back = p.$('list').querySelector('[data-later-show]');
  assert.match(back?.textContent || '', /1 später/);
  await p.click(back);
  await settle();
  assert.ok(row(p, 'Alpha EN'), 'shown again');
  p.close();
});
