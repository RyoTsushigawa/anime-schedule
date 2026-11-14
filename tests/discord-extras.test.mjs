import test from 'node:test';
import assert from 'node:assert/strict';
import { boerseLine, openVotes, previewLine } from '../tools/discord-extras.mjs';
import { parseCsv } from '../tools/boerse-prices.mjs';

const at = iso => Date.parse(iso);
test('Börse line: yesterday\'s best and worst show, and what is halted today', () => {
  const file = { seasons: { 'Herbst 2026': { days: ['2026-11-12', '2026-11-13'], shows: {
    Frieren: { closes: [100, 104.2] }, Dandadan: { closes: [110, 70.4], halted: '2026-11-14' }, Spy: { closes: [100, 100] } } } } };
  assert.equal(boerseLine(file, at('2026-11-14T08:00:00Z')), '📈 **Börse gestern:** Frieren +4,2 % (104,2) · Dandadan −36 % (70,4) · heute ausgesetzt: Dandadan');
  // no close from yesterday (stale file) or only one day: nothing
  assert.equal(boerseLine(file, at('2026-11-16T08:00:00Z')), '');
  assert.equal(boerseLine({ seasons: { 'Herbst 2026': { days: ['2026-11-13'], shows: { A: { closes: [100] } } } } }, at('2026-11-14T08:00:00Z')), '');
  // a season that isn't traded any more: nothing
  assert.equal(boerseLine({ seasons: { 'Sommer 2026': file.seasons['Herbst 2026'] } }, at('2026-11-14T08:00:00Z')), '');
});
const csv = [',,,,,,,,,,,', ',Sort,Slot,Anime Titel,Eng Anime Titel,Startdatum,Wo,Tag,Uhrzeit,MaRyo,Rei ,Terra',
  ',,,Alpha,Alpha EN,03.01.2027,,Sa.,11:25,Ja,Default,Nein', ',,,Beta,,04.01.2027,,Di.,14:25,"Nein,",,Ja', ',,,Gamma,,05.01.2027,,Di.,14:25,Ja,Default,Ja',
  ',,,,,,,,,,,', ',,Crunchyroll (C),,0,"0,00%",,,,,,', ',,,Amount,3,,,,,,,'].join('\n');
test('open Season Preview votes per voter: empty or Default, only the show list (not the counts below)', () => {
  assert.deepEqual(openVotes(parseCsv(csv)), [{ name: 'Rei', open: 3 }]);
});
test('preview reminder only in the 14 days before the start, and only with open votes', () => {
  const rows = parseCsv(csv);
  assert.equal(previewLine('Winter 2027', rows, at('2026-12-23T08:00:00Z'), 'https://site/'), '🗳️ **Season Preview Winter 2027** startet in 9 Tagen · noch offen: Rei (3)\n<https://site/season-preview.html>');
  assert.match(previewLine('Winter 2027', rows, at('2026-12-31T08:00:00Z')), /startet morgen/);
  assert.equal(previewLine('Winter 2027', rows, at('2026-12-10T08:00:00Z')), '', 'too early');
  assert.equal(previewLine('Winter 2027', rows, at('2027-01-02T08:00:00Z')), '', 'already started');
  const done = parseCsv(csv.replace(/Default/g, 'Ja').replace(',,Ja\n', ',Ja,Ja\n'));
  assert.equal(previewLine('Winter 2027', done, at('2026-12-23T08:00:00Z')), '');
});
