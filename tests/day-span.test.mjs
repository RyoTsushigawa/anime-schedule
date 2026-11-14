import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage, sec, MEDIA } from './harness.mjs';
// Test week: Mon 26 Oct 2026. Alpha Wed 20:00 (out Wed 15:00), Beta Sat (out Fri 17:00).
const day = (p, iso) => p.$('list').querySelector(`.day[data-date="${iso}"]`);

test('each day heading shows the evening at a glance: first start to the end of the last slot, and the number of episodes', async t => {
  const p = await openPage();
  t.after(() => p.close());
  await p.settle(400);
  assert.equal(day(p, '2026-10-28').querySelector('.day-span').textContent, '20:00–20:30 · 1 Folge');
  assert.equal(day(p, '2026-10-30').querySelector('.day-span'), null, 'a day without episodes has none');
});

test('a double episode counts twice and its two slots lengthen the evening', async t => {
  const alpha = { ...MEDIA[1] };
  const p = await openPage({ airings: [
    { airingAt: sec(2026, 9, 28, 14), episode: 1, media: alpha }, { airingAt: sec(2026, 9, 28, 14), episode: 2, media: alpha },
    { airingAt: sec(2026, 9, 30, 16), episode: 2, media: MEDIA[2] }] });
  t.after(() => p.close());
  await p.settle(400);
  assert.equal(day(p, '2026-10-28').querySelector('.day-span').textContent, '20:00–21:00 · 2 Folgen');
});

test('an episode that is not out yet at our watch time says from when', async t => {
  // moved to Wednesday 12:00, but the episode comes out at 15:00
  const p = await openPage({ movesFile: { moves: [{ show: 'showalpha', title: 'Alpha EN', tag: 'Mi.', time: '12:00', week: '2026-10-26' }] } });
  t.after(() => p.close());
  await p.settle(400);
  const row = [...p.$('list').querySelectorAll('.row')].find(r => /Alpha EN/.test(r.textContent));
  assert.match(row.querySelector('.not-out').textContent, /erst ab Mi\.? 15:00/);
  const beta = [...p.$('list').querySelectorAll('.row')].find(r => /Beta EN/.test(r.textContent));
  assert.equal(beta.querySelector('.not-out'), null);
});
