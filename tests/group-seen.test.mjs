import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// U: an episode everyone who watches it has already ticked on AniList before its slot is skipped ("Schon gesehen")
const profiles = { MaRyo: [{ provider: 'anilist', name: 'ryo' }, { provider: 'anilist', name: 'marvin' }], Belly: [{ provider: 'anilist', name: 'belly' }] };
const alphaRow = p => [...p.$('list').querySelectorAll('.row')].find(r => /Alpha EN/.test(r.textContent));

test('everyone already watched the episode: it is skipped as "Schon gesehen"', async () => {
  const p = await openPage({ profiles, groupSeen: { ryo: { 1: 99 }, marvin: { 1: 99 }, belly: { 1: 99 } } });
  try {
    await p.settle(400);
    const row = alphaRow(p);
    assert.ok(row.classList.contains('skipped'), 'Alpha is skipped');
    assert.match(row.textContent, /Schon gesehen/);
    assert.match(row.textContent, /alle haben sie schon gesehen/);
  } finally { p.close(); }
});

test('one person has not seen it yet (or has no list): it stays in the plan', async () => {
  const p = await openPage({ profiles, groupSeen: { ryo: { 1: 99 }, marvin: { 1: 0 }, belly: { 1: 99 } } });
  try {
    await p.settle(400);
    assert.ok(!alphaRow(p).classList.contains('skipped'));
    assert.doesNotMatch(alphaRow(p).textContent, /Schon gesehen/);
  } finally { p.close(); }
});
