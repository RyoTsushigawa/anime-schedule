import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/season-votes/index.js';
import {scoreGuess} from '../games-logic.mjs';
import {matchingCandidates,validateGuesses} from '../workers/season-votes/wordle-solver.mjs';
test('exact feedback handles duplicate yellow, gray and green letters',()=>{
 const pool=['APPLE','AMPLE','ALIEN','ALLEY'].map(word=>({word}));
 const marks=scoreGuess('ALLEY','APPLE');assert.deepEqual(marks,['hit','near','miss','near','miss']);
 assert.deepEqual(matchingCandidates(pool,[{word:'ALLEY',marks}],5).map(e=>e.word),['AMPLE','APPLE']);
 assert.deepEqual(matchingCandidates(pool,[{word:'ALLEY',marks},{word:'PAPER',marks:scoreGuess('PAPER','APPLE')}],5).map(e=>e.word),['APPLE']);
 assert.equal(matchingCandidates(pool,[{word:'APPLE',marks:Array(5).fill('miss')}],5).length,0);
});
test('input limits reject malformed and unbounded searches',()=>{
 for(const body of [{length:4,source:'anime',rows:[]},{length:5,source:'bad',rows:[]},{length:5,source:'anime',rows:Array(13).fill({})},{length:5,source:'anime',rows:[{word:'APPLE',marks:['hit']}]},{length:5,source:'anime',rows:[{word:'APPLE',marks:Array(5).fill('unknown')}]}])assert.throws(()=>validateGuesses(body));
});
test('only the verified GitHub owner can search; PINs, forged claims and other accounts fail',async()=>{
 const real=globalThis.fetch;let dictionaryReads=0;
 globalThis.fetch=async(url,init)=>{
  if(String(url)==='https://api.github.com/user'){const token=new Headers(init.headers).get('Authorization');if(token==='Bearer valid-owner')return Response.json({login:'RyoTsushigawa'});if(token==='Bearer valid-friend')return Response.json({login:'MilkyWay95'});return Response.json({message:'Bad credentials'},{status:401});}
  dictionaryReads++;
  if(String(url).endsWith('games-words.json'))return Response.json({words:[{word:'APPLE',title:'Apple anime'}]});
  if(String(url).endsWith('games-endless.json'))return Response.json({words:[{word:'AMPLE',title:'Ample anime'}]});
  if(String(url).endsWith('games-guesses.json'))return Response.json({words:{5:'APPLE AMPLE ALLEY'}});
  throw Error('Unexpected request');
 };
 const call=async(token,path='/wordle-solver/access',body)=>worker.fetch(new Request('https://worker.test'+path,{method:body?'POST':'GET',headers:{Origin:'https://ryotsushigawa.github.io',...(token?{'X-Owner-Key':token}:{}),'X-Person-Pin':'1234','X-AniList-Token':'forged'},...(body?{body:JSON.stringify(body)}:{})}),{});
 try{
  for(const [token,status] of [['',401],['valid-friend',403],['forged-owner',401]])assert.equal((await call(token)).status,status);
  assert.equal(dictionaryReads,0);assert.equal((await call('valid-owner')).status,200);
  const body={length:5,source:'anime',rows:[{word:'ALLEY',marks:scoreGuess('ALLEY','APPLE')}]};
  assert.equal((await call('valid-friend','/wordle-solver/solve',body)).status,403);assert.equal(dictionaryReads,0);
  const r=await call('valid-owner','/wordle-solver/solve',body);assert.equal(r.status,200);assert.match(r.headers.get('Cache-Control'),/no-store/);assert.equal((await r.json()).total,2);
  assert.equal((await call('forged-owner','/wordle-solver/solve',body)).status,401,'no reuse of another request’s authentication');
 }finally{globalThis.fetch=real;}
});
