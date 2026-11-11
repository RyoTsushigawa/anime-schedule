import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';
// Alpha airs Wed 28 Oct 15:00 and is watched at 20:00 by MaRyo and Belly. With MaRyo away, Belly is left
// alone, so the group sets Alpha out: episode 4 belongs in Catch-up as soon as it has aired, not at 20:00.
const run = async absent => {
  const p = await openPage({ list: { 1: { status: 'CURRENT', progress: 3 } }, movesFile: { moves: [], ...(absent && { absent }) } });
  p.advance(4 * 3600000);                       // 16:00: aired, but before the 20:00 slot
  await p.click(p.$('viewWeek'));
  await p.click(p.$('viewCatchup'));
  const listed = p.$('list').textContent.includes('Alpha EN');
  p.close();
  return listed;
};
test('a show set out because of an absence is in Catch-up as soon as it has aired', async () => {
  assert.equal(await run([{ day: '2026-10-28', people: ['MaRyo'] }]), true);
});
test('without the absence it waits for its watch slot', async () => {
  assert.equal(await run(null), false);
});
