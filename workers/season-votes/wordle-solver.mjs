import {scoreGuess,ANIME_WORDS} from '../../games-logic.mjs';
const error=(status,message)=>{throw Object.assign(new Error(message),{status});};
export async function solverOwner(request){
 const token=(request.headers.get('X-Owner-Key')||'').trim();
 if(!token||token.length>1000)error(401,'Bitte deinen Bearbeitungszugang auf der Hauptseite einrichten.');
 const r=await fetch('https://api.github.com/user',{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','User-Agent':'anime-schedule-private-solver'},signal:AbortSignal.timeout(10000)});
 if(r.status===401)error(401,'Der Bearbeitungsschlüssel ist nicht mehr gültig.');
 if(!r.ok)error(503,'GitHub konnte den Zugang gerade nicht bestätigen. Bitte später erneut versuchen.');
 const user=await r.json();
 if(String(user.login).toLowerCase()!=='ryotsushigawa')error(403,'Dieser Solver ist nur für Ryo freigeschaltet.');
}
export function validateGuesses(body){
 const {length,rows,source}=body||{};
 if(!Number.isInteger(length)||length<5||length>8||!['anime','english'].includes(source)||!Array.isArray(rows)||rows.length<1||rows.length>12)error(400,'Wähle 5–8 Buchstaben und gib 1–12 Versuche ein.');
 for(const row of rows)if(!row||typeof row.word!=='string'||!new RegExp('^[A-Z]{'+length+'}$').test(row.word)||!Array.isArray(row.marks)||row.marks.length!==length||row.marks.some(m=>!['hit','near','miss'].includes(m)))error(400,'Jeder Versuch braucht ein vollständiges Wort und eine Farbe pro Buchstabe.');
 return {length,rows,source};
}
export function matchingCandidates(entries,rows,length){
 return entries.filter(e=>e.word.length===length&&rows.every(r=>scoreGuess(r.word,e.word).every((mark,i)=>mark===r.marks[i]))).sort((a,b)=>a.word.localeCompare(b.word));
}
let dictionary;
async function vocabulary(env){
 const base=env.SITE_URL||'https://ryotsushigawa.github.io/anime-schedule/';
 if(dictionary&&dictionary.base===base&&Date.now()-dictionary.at<300000)return dictionary;
 const files=await Promise.all(['games-words.json','games-endless.json','games-guesses.json'].map(async file=>{const r=await fetch(base+file,{signal:AbortSignal.timeout(15000)});if(!r.ok)error(503,'Die Wortliste ist gerade nicht erreichbar.');return r.json();}));
 const [daily,endless,english]=files,anime=new Map();
 const add=e=>{if(e&&/^[A-Z]{5,8}$/.test(e.word)&&typeof e.title==='string'&&!anime.has(e.word))anime.set(e.word,{word:e.word,title:e.title.slice(0,250)});};
 for(const e of [...(daily.words||[]),...(endless.words||[]),...(endless.popular||[])])add(e);
 for(const pair of endless.extreme||[])if(Array.isArray(pair))add({word:pair[0],title:pair[1]});
 const words=new Set([...Object.values(english.words||{}).flatMap(v=>String(v).split(' ')),...ANIME_WORDS,...anime.keys()]);
 dictionary={base,at:Date.now(),anime:[...anime.values()],english:[...words].filter(w=>/^[A-Z]{5,8}$/.test(w)).map(word=>({word}))};return dictionary;
}
export async function solveWordle(body,env){
 const {length,rows,source}=validateGuesses(body),pool=await vocabulary(env);
 const matches=matchingCandidates(pool[source],rows,length);
 return {total:matches.length,candidates:matches.slice(0,200),source,length};
}
