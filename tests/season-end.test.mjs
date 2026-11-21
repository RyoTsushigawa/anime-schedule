import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// The last two weeks of a season: one line with Awards, Wrapped and Troddl; not before
test('season end line: only in the last two weeks, with the links', async () => {
  const p = await openPage();
  try {
    assert.equal(p.run("seasonEndLine(new Date(2026, 10, 28))"), '');
    const line = p.run("seasonEndLine(new Date(2026, 11, 20))");
    assert.match(line, /Season-Ende Herbst 2026/);
    for (const page of ['awards.html', 'wrapped.html', 'troddl.html']) assert.match(line, new RegExp(`href="${page}"`));
    assert.match(p.run("seasonEndLine(new Date(2027, 2, 25))"), /Season-Ende Winter 2027/);
  } finally { p.close(); }
});
