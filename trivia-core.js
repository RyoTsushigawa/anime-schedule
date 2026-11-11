// Pure, reusable trivia question builder. Uses real metadata from AniList;
 // never asks a question unless its incorrect answers are known to be incorrect.
const TriviaCore=(()=>{
 const norm=s=>String(s||'').normalize('NFKC').toLocaleLowerCase().replace(/[\\p{P}\\p{S}\\s]+/gu,' ').trim();
 const distinct=values=>[...new Set(values.filter(Boolean))];
 const shuffle=(arr,rand=Math.random)=>{const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
 function matchShows(shows,catalog){
  const byName=new Map();
  for(const e of catalog||[])for(const name of [e.romaji,e.english]){const key=norm(name);if(key&&!byName.has(key))byName.set(key,e);}
  const found=new Map();
  for(const show of shows||[]){
   const e=[show.romaji,show.english].map(n=>byName.get(norm(n))).find(Boolean);
   const id=Number(String(e?.mal||'').match(/^https:\/\/myanimelist\.net\/anime\/(\\d+)/)?.[1]);
   if(Number.isSafeInteger(id)&&id>0&&!found.has(id))found.set(id,{id,title:show.english||show.romaji});
  }
  return [...found.values()];
 }
 function questions(media,random=Math.random){
  const entries=media.filter(m=>m&&m.title&&Array.isArray(m.genres));
  const genres=distinct(entries.flatMap(m=>m.genres));
  const studios=distinct(entries.flatMap(m=>m.studios||[]));
  const result=[];
  for(const m of entries){
   const title=m.title;
   for(const correct of m.genres.slice(0,2)){
    const bad=genres.filter(g=>!m.genres.includes(g));
    if(bad.length>=3)result.push({prompt:`Welches Genre gehört zu „${title}“?`,correct,options:shuffle([correct,...shuffle(bad,random).slice(0,3)],random),explain:`${title}: ${m.genres.join(', ')}`});
   }
   for(const studio of (m.studios||[]).slice(0,1)){
    const bad=studios.filter(x=>!(m.studios||[]).includes(x));
    if(bad.length>=3)result.push({prompt:`Welches Studio hat an „${title}“ gearbeitet?`,correct:studio,options:shuffle([studio,...shuffle(bad,random).slice(0,3)],random),explain:`${title}: ${(m.studios||[]).join(', ')}`});
   }
   for(const genre of m.genres.slice(0,1)){
    const others=entries.filter(x=>x.title!==title&&!x.genres.includes(genre)).map(x=>x.title);
    if(distinct(others).length>=3)result.push({prompt:`Welcher Anime hat das Genre „${genre}“?`,correct:title,options:shuffle([title,...shuffle(distinct(others),random).slice(0,3)],random),explain:`${title} hat unter anderem das Genre ${genre}.`});
   }
  }
  return shuffle(result,random);
 }
 function score(answer,correct){return answer===correct?100:0;}
 return {norm,matchShows,questions,shuffle,score};
})();
