import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage, MEDIA, sec } from './harness.mjs';
// Idea 6: a finale this week with a sequel AniList already knows → "Fortsetzung angekündigt" next to "Finale".
// Idea 48: the Discord message marks last episodes "(Finale)".
const finale = { ...MEDIA[1], episodes: 4 };
const sequel = { relations: { edges: [
  { relationType: 'PREQUEL', node: { id: 90, type: 'ANIME', format: 'TV', status: 'FINISHED', title: { english: 'Alpha Zero' }, startDate: {} } },
  { relationType: 'SEQUEL', node: { id: 91, type: 'ANIME', format: 'TV', status: 'NOT_YET_RELEASED', title: { english: 'Alpha Season 2' }, startDate: { year: 2027, month: 4 } } },
] } };
const open = media => openPage({ airings: [{ airingAt: sec(2026, 9, 28, 14), episode: 4, media: finale }], media: { 1: { episodes: 4, ...media } } });
const alpha = p => [...p.$('list').querySelectorAll('.row')].find(r => r.textContent.includes('Alpha EN'));

test('finale with an announced sequel: a link to it next to "Finale"', async () => {
  const p = await open(sequel);
  await new Promise(r => setTimeout(r, 50));
  const tag = alpha(p).querySelector('.sequel-tag');
  assert.ok(tag, 'tag shown');
  assert.equal(tag.textContent, 'Fortsetzung angekündigt');
  assert.match(tag.getAttribute('href'), /anilist\.co\/anime\/91$/);
  assert.match(tag.title, /Alpha Season 2 · April 2027/);
  p.close();
});
test('finale without a sequel: no tag', async () => {
  const p = await open({ relations: { edges: [] } });
  await new Promise(r => setTimeout(r, 50));
  assert.ok(alpha(p).textContent.includes('Finale'));
  assert.equal(alpha(p).querySelector('.sequel-tag'), null);
  p.close();
});
test('the Discord message marks the finale', async () => {
  const p = await open({ relations: { edges: [] } });
  const day = p.window.discordDay('2026-10-28');
  assert.ok(day, 'Wednesday rendered');
  assert.match(p.window.discordMessage(day), /\(Finale\)/);
  p.close();
});
