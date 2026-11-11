import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
function functionSource(name) {
 const start = source.indexOf('function ' + name + '(');
 assert.ok(start >= 0, name + ' exists');
 const open = source.indexOf('{', start);
 let level = 0;
 for (let i = open; i < source.length; i++) {
  if (source[i] === '{') level++;
  else if (source[i] === '}' && --level === 0) return source.slice(start, i + 1);
 }
 throw Error('Unclosed function ' + name);
}

test('skipped episodes become due when aired, while ordinary episodes retain the watch slot', () => {
 const evaluate = new Function('released', 'skip', [
  "const NIGHT_UNTIL=5;",
  "const moveFor=()=>skip?{skip:true}:null;",
  "const watchDay=()=>new Date((released+86400)*1000);",
  "const parseTime=()=>null;",
  "const isoDay=()=>'';",
  functionSource('dueAt'),
  "return dueAt(released, {tag:'Mo.'}, {romaji:'Example'});"
 ].join('\n'));
 const release = 1794360000;
 assert.equal(evaluate(release, true), release);
 assert.ok(evaluate(release, false) > release);
});

test('a skipped schedule row retains streaming links and the watched checkmark', () => {
 const pause = source.slice(source.indexOf('const pause = ('), source.indexOf('const rewatch = ('));
 assert.match(pause, /skipped && alId \? linkButtons\(links \|\| \[\], alId, who\)/);
 assert.match(pause, /skipped && alId && episode > 0/);
 assert.match(pause, /watchButton\(alId, episode\)/);
 assert.match(source, /skipped: true, show, slot, when, episode, alId: m\.id, links/);
});

test('absence skips retain watch links and media ID too', () => {
 assert.match(source, /missing, maybe, alId: r\.m\?\.id, links: r\.links, who: r\.who/);
});
