import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const ctx = {};
vm.runInNewContext(readFileSync(new URL('../wrapped-data.js', import.meta.url), 'utf8') + '\n;globalThis.WrappedStats = WrappedStats;', ctx);
const { WrappedStats } = ctx;
const winter = new Date(2027, 0, 1).getTime(), spring = new Date(2027, 3, 1).getTime(), fall = new Date(2026, 9, 1).getTime();
const entry = (status, progress, media, completedAt) => ({ status, progress, score: 0, completedAt: completedAt || {}, media: { title: { romaji: 'x' }, genres: [], ...media } });

test('watch time: completed in the season, plus progress on this season\'s own running, paused or dropped shows', () => {
 const entries = [
  entry('COMPLETED', 12, { episodes: 12, duration: 24 }, { year: 2027, month: 2, day: 10 }),           // 12 eps
  entry('CURRENT', 5, { episodes: 12, duration: 24, season: 'WINTER', seasonYear: 2027 }),             // 5 eps
  entry('DROPPED', 2, { episodes: 12, duration: 30, season: 'WINTER', seasonYear: 2027 }),             // 2 eps × 30
  entry('CURRENT', 40, { episodes: 100, duration: 24, season: 'FALL', seasonYear: 2025 }),             // older: not counted
  entry('COMPLETED', 12, { episodes: 12, duration: 24 }, { year: 2026, month: 11, day: 1 }),            // last season
 ];
 const now = WrappedStats.list(entries, winter, spring);
 assert.equal(now.watchEpisodes, 19);
 assert.equal(now.watchMinutes, 17 * 24 + 2 * 30);
 assert.equal(now.watchShows, 3);
 const before = WrappedStats.list(entries, fall, winter);
 assert.equal(before.watchEpisodes, 12);
 assert.equal(before.completed, 1);
});
