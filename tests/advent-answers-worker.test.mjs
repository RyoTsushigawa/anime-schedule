import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/season-votes/index.js';
import './votes-identity-stub.mjs';
const origin='https://ryotsushigawa.github.io',code='test-group-code-123456';
function environment(now='2026-11-14T12:00:00Z') {const data=new Map();return {data,SITE_ORIGIN:origin,GROUP_ACCESS_CODE:code,TEST_NOW:String(Date.parse(now)),AWARDS:{get:async k=>data.get(k)||null,put:async(k,v)=>data.set(k,v),list:async({prefix})=>({keys:[...data.keys()].filter(k=>k.startsWith(prefix)).map(name=>({name})),list_complete:true})}};}
async function call(env,body,query='?year=2026&door=0',headers={}){const r=await worker.fetch(new Request('https://votes.test/advent/answers'+(body?'':query),{method:body?'POST':'GET',headers:{Origin:origin,'X-Group-Code':code,'X-AniList-Token':'tok-RyoTsushigawa',...headers},...(body?{body:JSON.stringify(body)}:{})}),env);return {status:r.status,...await r.json()};}
test('sample answers persist separately for Ryo and Marvin, edits replace only the author',async()=>{const e=environment();
 const body={year:2026,door:0,person:'Ryo',text:'Ich packe Snacks ein.'};assert.equal((await call(e,body)).status,200);
 assert.equal((await call(e,{...body,person:'Marvin',text:'Ich lese die Quest.'},'',{'X-AniList-Token':'tok-MilkyWay95'})).status,200);
 assert.equal((await call(e,{...body,text:'Snacks und Getränke!'})).status,200);
 const r=await call(e);assert.equal(r.answers.length,2);assert.equal(r.answers.find(a=>a.person==='Ryo').text,'Snacks und Getränke!');assert.ok([...e.data.keys()].includes('advent:2026:0:Marvin'));
});
test('group access and verified author enforced; unopened doors cannot be read or written',async()=>{const e=environment(),body={year:2026,door:0,person:'Marvin',text:'Nope'};
 assert.equal((await call(e,body)).status,403);assert.equal((await call(e,null,undefined,{'X-Group-Code':''})).status,401);
 assert.equal((await call(e,{...body,person:'Ryo',door:1})).status,403);assert.equal((await call(e,null,'?year=2026&door=1')).status,403);
 assert.equal((await call(e,{...body,person:'Ryo',text:' '})).status,400);assert.equal((await call(e,{...body,person:'Ryo',text:'x'.repeat(1001)})).status,400);
 assert.equal((await call(e,null,'?year=2026&door=25')).status,400);
});
test('Berlin midnight opens door 1 and answers remain accessible afterward',async()=>{const e=environment('2026-11-30T23:00:00Z');
 assert.equal((await call(e,{year:2026,door:1,person:'Ryo',text:'Hallo!'})).status,200);
 e.TEST_NOW=String(Date.parse('2027-02-01T12:00:00Z'));assert.equal((await call(e,null,'?year=2026&door=1')).answers[0].text,'Hallo!');
});
