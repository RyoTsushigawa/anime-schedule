import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// finishing a show: the score dialog links to a Troddl review of exactly that show
test('the score dialog offers a Troddl review of the finished show', async () => {
  const p = await openPage({ storage: { anilistAccounts: JSON.stringify([{ name: 'Tester', token: 'x' }]), anilistActive: 'Tester', anilistUser: 'Tester' } });
  try {
    p.run("openScore(189123, 'Blue Box')");
    assert.equal(p.$('scoreName').textContent, 'Blue Box');
    assert.match(p.$('scoreTroddl').getAttribute('href'), /^troddl\.html#write=189123$/);
    assert.equal(p.$('scoreTroddl').getAttribute('target'), '_blank');
  } finally { p.close(); }
});
