import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// Season Preview: a sequel shows the Troddlrating of the season before it (AniList prequel → the group's reviews)
const source = readFileSync(new URL('../season-preview.js', import.meta.url), 'utf8');
const part = source.slice(source.indexOf('let troddlHints='), source.indexOf('function draftButton('));
const make = new Function('env', `let {current,voteApi,shows,storedGroupCode,sequelGraph,catalogIds,render,fetch}=env;
 ${part}
 return { load: loadTroddlHints, chip: troddlChip };`);
const reviews = [{ mediaId: 201, score: 90 }, { mediaId: 201, score: 70 }, { mediaId: 301, score: 40 }];
function page({ code = 'group-code-1234567890' } = {}) {
  let rendered = 0;
  const tab = { gid: 'w27' };
  const env = { current: tab, voteApi: 'https://votes.test', storedGroupCode: () => code,
    shows: [{ key: 'a', mal: 1 }, { key: 'b', mal: 2 }, { key: 'c', mal: 3 }],
    catalogIds: (t, s) => [String(s.mal)],
    sequelGraph: async () => new Map([[1, [201]], [2, [301]], [3, [999]]]),
    render: () => { rendered++; },
    fetch: async (url, opts) => { assert.equal(url, 'https://votes.test/troddl'); assert.equal(opts.headers['X-Group-Code'], code); return { ok: true, json: async () => ({ reviews }) }; } };
  return { ...make(env), rendered: () => rendered };
}
test('a sequel gets its previous season\'s Troddlrating, linked to its reviews; one review is "tbd"', async () => {
  const p = page();
  await p.load();
  assert.equal(p.rendered(), 1);
  assert.match(p.chip({ key: 'a' }), /href="troddl\.html#m=201"[^>]*>Staffel davor · Troddl <span class="troddl-score good">80<\/span>/);
  assert.match(p.chip({ key: 'b' }), /troddl-score tbd">tbd</);
  assert.equal(p.chip({ key: 'c' }), ''); // its prequel has no reviews
});
test('without the group code nothing is asked and nothing shown', async () => {
  const p = page({ code: '' });
  await p.load();
  assert.equal(p.chip({ key: 'a' }), '');
  assert.equal(p.rendered(), 0);
});
