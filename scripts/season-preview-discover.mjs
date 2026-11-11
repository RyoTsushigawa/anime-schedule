#!/usr/bin/env node
// Discover AniList trailer candidates for standalone Google Sheet season tabs.
// This never publishes unreviewed matches. The reviewed catalog is a separate file.
import { readFile, writeFile } from 'node:fs/promises';

const SHEET_ID=process.env.SEASON_SHEET_ID||'1cbkuLjyLfHpYDor5A1LvIskEOUB9Ij2Nm2TYch62-hQ';
const SEASON=/^(Winter|Frühling|Sommer|Herbst) (20\d{2})$/i;
const MONTHS={winter:0,'frühling':3,sommer:6,herbst:9};
const KEY={winter:'winter','frühling':'spring',sommer:'summer',herbst:'fall'};
const norm=s=>String(s||'').normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu,' ').trim();
export function parseCSV(text){
 const rows=[[]];let value='',quotes=false;
 for(let i=0;i<text.length;i++){const char=text[i];
  if(quotes){if(char==='"'&&text[i+1]==='"'){value+='"';i++;}else if(char==='"')quotes=false;else value+=char;}
  else if(char==='"')quotes=true;else if(char===','){rows.at(-1).push(value);value='';}
  else if(char==='\n'){rows.at(-1).push(value.replace(/\r$/,''));rows.push([]);value='';}
  else value+=char;
 }
 rows.at(-1).push(value);return rows;
}
export function parseShows(rows){
 const h=rows.findIndex(row=>row.some(c=>String(c).trim()==='Anime Titel'));
 if(h<0)throw Error('Sheet missing Anime Titel header');
 const title=rows[h].indexOf('Anime Titel'), english=rows[h].indexOf('Eng Anime Titel');
 return rows.slice(h+1).filter(r=>String(r[title]||'').trim()).map((r,i)=>({
  order:i+1,title:String(r[title]).trim(),english:english<0?'':String(r[english]||'').trim(),
  key:String(r[title]).trim().toLocaleLowerCase()
 }));
}
export function seasonId(name){
 const match=String(name).match(SEASON);
 return match?KEY[match[1].toLowerCase()]+'-'+match[2]:null;
}
export function likelySequel(media,title){
 if(media?.relations?.edges?.some(e=>e.relationType==='PREQUEL'))return 'sequel';
 // Names can indicate probable sequels, but never qualify an entry as *not* a sequel.
 if(/\b(?:season\s*[2-9]\d*|[2-9]\d*(?:st|nd|rd|th)\s+season|part\s*[2-9]|cour\s*[2-9]|s[2-9]\b|[2-9]nd\s+season)\b/i.test(title))return 'sequel';
 return 'unknown';
}
export function normalizeCandidate(media,show){
 const fullName=String(media?.title?.romaji||'');
 const en=String(media?.title?.english||'');
 const expected=[show.title,show.english].filter(Boolean).map(norm);
 const titles=[fullName,en].filter(Boolean).map(norm);
 if(!expected.some(t=>titles.includes(t)))return null;
 const vid=media?.trailer?.site==='youtube'?media.trailer.id:'';
 return {
  key:show.key,order:show.order,title:show.title,english:show.english,
  anilistId:media.id||null,malId:media.idMal||null,
  sequelStatus:likelySequel(media,show.title),
  youtubeId:/^[A-Za-z0-9_-]{11}$/.test(vid||'')?vid:null,
  source:'AniList metadata (candidate only)',
  review:'pending',
  reason:'Verify official source, actual anime footage, full trailer vs teaser, subtitles, and sequel status before approval'
 };
}
async function getJSON(url){
 const res=await fetch(url,{headers:{Accept:'application/json'}});
 if(!res.ok)throw Error(url.split('?')[0]+' HTTP '+res.status);
 return res.json();
}
async function getTabs(){
 const key=JSON.parse(await readFile('config.json','utf8')).sheetsKey;
 if(!key)throw Error('Missing sheetsKey from public config.json');
 const data=await getJSON('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SHEET_ID)+'?fields=sheets(properties(sheetId,title))&key='+encodeURIComponent(key));
 return (data.sheets||[]).map(s=>s.properties).filter(p=>seasonId(p.title));
}
async function queryAniList(title){
 const body={query:'query ($search:String) { Media(search:$search,type:ANIME) { id idMal title { romaji english } trailer { id site } relations { edges { relationType } } } }',variables:{search:title}};
 const res=await fetch('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(body)});
 if(res.status===429)throw Error('AniList rate limited; retry next run');
 if(!res.ok)throw Error('AniList HTTP '+res.status);
 const value=await res.json();return value?.data?.Media||null;
}
async function searchYoutube(title){
 const key=process.env.YOUTUBE_API_KEY;
 if(!key)return [];
 const params=new URLSearchParams({part:'snippet',type:'video',maxResults:'5',safeSearch:'strict',
  q:title+' anime official full trailer',key});
 const result=await getJSON('https://www.googleapis.com/youtube/v3/search?'+params);
 return (result.items||[]).flatMap(item=>{
  const id=item.id?.videoId;
  if(!/^[A-Za-z0-9_-]{11}$/.test(id||''))return [];
  return [{youtubeId:id,title:item.snippet?.title||'',channel:item.snippet?.channelTitle||'',
   publishedAt:item.snippet?.publishedAt||'',source:'YouTube search — NOT VERIFIED'}];
 });
}
async function main(){
 const now=new Date(),month=now.getUTCFullYear()*12+now.getUTCMonth();
 const tabs=(await getTabs()).filter(t=>{
  const m=t.title.match(SEASON),start=+m[2]*12+MONTHS[m[1].toLowerCase()];
  return start>=month-3 && start<=month+8;
 });
 const prior=await readFile('season-trailer-candidates.json','utf8').then(JSON.parse).catch(()=>({seasons:{}}));
 const catalog=await readFile('season-trailers.json','utf8').then(JSON.parse);
 const report={schemaVersion:1,generated:new Date().toISOString(),seasons:{}};
 for(const tab of tabs){
  const key=seasonId(tab.title);
  const res=await fetch('https://docs.google.com/spreadsheets/d/'+SHEET_ID+'/export?format=csv&gid='+tab.sheetId);
  if(!res.ok)throw Error('Cannot read '+tab.title+' (HTTP '+res.status+')');
  const shows=parseShows(parseCSV(await res.text()));
  const previously=prior.seasons?.[key]?.entries||[];
  const entries=[];
  // Hard limit daily lookups; reuse cached IDs to avoid AniList rate limits.
  let requests=0;
  for(const s of shows){
   const old=previously.find(e=>e.key===s.key);
   const approved=catalog.seasons?.[key]?.trailers?.[s.key];
   if(approved?.verified && approved?.footageVerified){entries.push({...old,...s,review:'approved',sequelStatus:approved.sequelStatus});continue;}
   if(old?.checkedAt && Date.now()-Date.parse(old.checkedAt)<(old.youtubeId?7:2)*86400000){
    entries.push({...old,...s,review:old.review==='approved'?'pending':old.review});continue;
   }
   if(requests>=12){entries.push({...old,...s,review:'pending',reason:'Awaiting AniList lookup'});continue;}
   requests++;
   try{
    const media=await queryAniList(s.title);
    const match=normalizeCandidate(media,s);
    entries.push({...s,...(match||{review:'pending',reason:'AniList title match uncertain'}),checkedAt:new Date().toISOString()});
   }catch(error){entries.push({...old,...s,review:'pending',reason:error.message});}
   await new Promise(resolve=>setTimeout(resolve,850));
  }
  // Search is quota-limited: max 6 YouTube queries per run, candidates ONLY.
  // Videos stay unapproved until a person checks the actual footage and source.
  let searched=0;
  for(const item of entries){
   if(searched>=6||!process.env.YOUTUBE_API_KEY)break;
   const approved=catalog.seasons?.[key]?.trailers?.[item.key];
   if(approved?.verified&&approved?.footageVerified)continue;
   if(item.lastYoutubeSearch&&Date.now()-Date.parse(item.lastYoutubeSearch)<7*86400000)continue;
   searched++;
   try{
    item.youtubeSearch=await searchYoutube(item.english||item.title);
    item.lastYoutubeSearch=new Date().toISOString();
   }catch(error){item.youtubeSearchError=String(error.message).slice(0,150);}
  }
  report.seasons[key]={title:tab.title,gid:String(tab.sheetId),entries};
 }
 await writeFile('season-trailer-candidates.json',JSON.stringify(report,null,2)+'\n');
 console.log('Checked '+tabs.length+' season sheets; wrote review candidates (no automatic publication)');
}
if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href)main().catch(err=>{console.error(err);process.exitCode=1;});
