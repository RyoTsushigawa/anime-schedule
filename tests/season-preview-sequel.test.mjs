import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../season-preview.js',import.meta.url),'utf8');
const start=source.indexOf('function sequelSuggestion(');
const end=source.indexOf('async function sequelGraph(',start);
assert.ok(start>=0&&end>start,'sequel recommendation helper exists');
const suggest=new Function('prequels','statuses',source.slice(start,end)+'\nreturn sequelSuggestion(prequels,statuses);');

test('completed direct prequel recommends Ja',()=>{
 assert.equal(suggest([101],new Map([[101,'COMPLETED']])),'Ja');
});
test('dropped direct prequel recommends Nein',()=>{
 assert.equal(suggest([101],new Map([[101,'DROPPED']])),'Nein');
});
test('unrecognized prequels never invent a recommendation',()=>{
 assert.equal(suggest([],new Map([[101,'COMPLETED']])),'');
 assert.equal(suggest([102],new Map([[101,'COMPLETED']])),'');
});
test('conflicting completed and dropped prequels have no automatic answer',()=>{
 assert.equal(suggest([101,102],new Map([[101,'COMPLETED'],[102,'DROPPED']])),'');
 assert.equal(suggest([101],new Map([[101,'CONFLICT']])),'');
});
test('manual votes remain authoritative and recommendations are opt-in',()=>{
 assert.match(source,/voteValue\(s,voter\)==='Default'[^\n]*sequelSuggestions\.get/);
 assert.match(source,/voteValue\(show,currentVoter\(\)\)==='Default'/);
 assert.match(source,/saveVote\(show,auto\.dataset\.autoVote\)/);
 assert.match(source,/e\.relationType==='PREQUEL'/);
 assert.doesNotMatch(source,/saveVote\(show,choice\);\s*\/\/\s*automatic/i);
});
