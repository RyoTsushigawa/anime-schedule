#!/usr/bin/env node
// Single-anime season review. Intended for a manual GitHub Actions dispatch.
// Never guesses officiality, subtitles, footage, or sequel status.
import {readFile,writeFile} from 'node:fs/promises';
const values=process.argv.slice(2);
const read=name=>{const i=values.indexOf('--'+name);return i<0?null:values[i+1];};
const enabled=name=>values.includes('--'+name);
const season=read('season'),key=read('key')?.trim().toLocaleLowerCase(),action=read('action');
const video=read('youtube')||'',subs=read('subs')||'',title=read('title')||'';
const reason=read('reason')||'';
const validSeason=/^(winter|spring|summer|fall)-20\d{2}$/;
const validVideo=/^[A-Za-z0-9_-]{11}$/;
if(!season||!validSeason.test(season)||!key||!['approve-full','approve-teaser','approve-alternate','mark-missing','mark-sequel','clear-status'].includes(action))
 throw Error('Supply valid --season, --key, --action');
const report=JSON.parse(await readFile('season-trailer-candidates.json','utf8'));
const seasonData=report.seasons?.[season];
const show=seasonData?.entries?.find(e=>e.key===key);
if(!show)throw Error('Show is not present in the latest candidate report');
if(show.carriedOver!==false||seasonData.previousSeasonChecked!==true)
 throw Error('Previous season has not been checked, or this show is a carryover');
const file='season-trailers.json',data=JSON.parse(await readFile(file,'utf8'));
data.seasons||={};data.seasons[season]||={trailers:{}};
const entry=data.seasons[season];entry.trailers||={};
const old=entry.trailers[key]||{};
const today=new Date().toISOString();
const approved=action.startsWith('approve-');
if(approved){
 if(!validVideo.test(video))throw Error('A real 11-character YouTube video ID is required');
 if(!enabled('confirmed-official')||!enabled('confirmed-footage')||!enabled('confirmed-not-sequel'))
  throw Error('Reviewer must confirm official upload, meaningful footage, and no sequel');
 if(show.sequelStatus==='sequel')throw Error('AniList indicates this is a sequel');
 if(subs&&!['de','en'].includes(subs))throw Error('Unsupported subtitles (use de/en/blank)');
 if(action==='approve-teaser'&&!enabled('confirmed-no-full'))
  throw Error('Teasers require a documented search that found no full trailer');
 const next={type:action==='approve-teaser'?'teaser':'full_trailer',
  verified:true,footageVerified:true,sequelStatus:'not_sequel',youtubeId:video,
  title:title||(action==='approve-teaser'?'Official teaser (fallback)':'Official full trailer'),
  ...(subs?{subtitles:subs}:{}),
  ...(action==='approve-teaser'?{fallbackApproved:true,fullTrailerUnavailable:true}:{}),
  reviewedAt:today,reviewSource:'GitHub Actions human review'};
 if(action==='approve-alternate'){
  if(!old.youtubeId||old.verified!==true)throw Error('Approve the primary video before adding an alternate');
  const alternatives=(old.candidates||[]).filter(x=>x.youtubeId!==video);
  if(old.youtubeId!==video)alternatives.push(next);
  entry.trailers[key]={...old,candidates:alternatives};
 }else{
  const alternatives=(old.candidates||[]).filter(x=>x.youtubeId!==video);
  if(old.youtubeId&&old.youtubeId!==video)alternatives.push(
   Object.fromEntries(Object.entries(old).filter(([field])=>field!=='candidates'&&field!=='youtubeStatus'))
  );
  entry.trailers[key]={...next,candidates:alternatives};
 }
}else if(action==='mark-sequel'){
 if(!reason.trim())throw Error('Provide a source/reason to classify this show as a sequel');
 entry.trailers[key]={sequelStatus:'sequel',reviewedAt:today,reviewSource:reason.trim()};
}else if(action==='mark-missing'){
 if(!enabled('confirmed-no-full')||!reason.trim())
  throw Error('A checked YouTube search and a review note are required');
 if(old.verified===true&&old.youtubeId)
  throw Error('Cannot overwrite an approved trailer with missing status. Review availability first.');
 entry.trailers[key]={sequelStatus:'not_sequel',youtubeStatus:'not_found',
  reviewedAt:today,reviewSource:reason.trim()};
}else if(action==='clear-status'){
 if(old.verified===true)throw Error('Cannot clear an approved trailer here; use an explicit approval instead');
 delete entry.trailers[key];
}
data.schemaVersion=Math.max(data.schemaVersion||1,5);
await writeFile(file,JSON.stringify(data,null,2)+'\n');
console.log(action+' → '+show.title+' ('+season+'); existing playlist remains unchanged until successful sync.');
