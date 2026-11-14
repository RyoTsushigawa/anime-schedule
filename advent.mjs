import {CALENDAR_YEAR,calendarState,readOpened,writeOpened} from './advent-core.mjs';
import {doors,sample} from './advent-content.mjs';
const $=id=>document.getElementById(id);
let storage;try{storage=localStorage;}catch{}
let opened=readOpened(storage),lastTrigger=null;
const types={quiz:'Anime-Quiz',challenge:'Mini-Challenge',prompt:'Für die Runde'};
function el(tag,text,className){const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;}
function render(){
 const state=calendarState();
 $('adventDoors').replaceChildren(...doors.map((_,i)=>{
  const n=i+1,available=n<=state.available,seen=opened.has(n)&&available,b=el('button',null,'advent-door');b.type='button';b.dataset.day=n;
  b.setAttribute('aria-disabled',String(!available));b.setAttribute('aria-label',`${n}. Dezember · ${available?seen?'schon geöffnet':'Türchen öffnen':'noch geschlossen'}`);
  b.classList.toggle('is-open',seen);b.classList.toggle('is-today',state.today===n);
  b.append(el('span',String(n).padStart(2,'0'),'door-number'),el('span',state.today===n?'Heute':seen?'Noch einmal':available?'Öffnen':`${n}. Dezember`,'door-note'));
  b.addEventListener('click',()=>openDoor(n,b));return b;
 }));
 $('adventCount').textContent=`${[...opened].filter(n=>n<=state.available).length} von 24 geöffnet`;
 $('adventToday').hidden=!state.today;
 $('adventStatus').textContent=state.available===0?'Das erste Türchen öffnet am 1. Dezember.':state.available===24?'Alle Türchen sind offen. Viel Spaß beim Nachholen!':`${state.available} Türchen warten auf dich.`;
 updateSnow();
}
function openDoor(n,trigger){
 if(n&&n>calendarState().available){$('adventStatus').textContent=`Noch ein bisschen Geduld: Dieses Türchen öffnet am ${n}. Dezember ${CALENDAR_YEAR}.`;return;}
 lastTrigger=trigger;const item=n?doors[n-1]:sample;
 $('adventDoorType').textContent=(n?`${n}. Dezember`:'Probetürchen')+' · '+types[item.type];
 $('adventDoorTitle').textContent=item.title;
 const body=$('adventDoorBody');body.replaceChildren(el('p',item.text));
 if(item.type==='quiz'){
  const choices=el('div',null,'advent-choices'),answer=el('p',null,'advent-answer');answer.hidden=true;answer.setAttribute('role','status');
  item.options.forEach((option,i)=>{const b=el('button',option);b.type='button';b.addEventListener('click',()=>{
   [...choices.children].forEach((button,j)=>{button.disabled=true;button.classList.toggle('correct',j===item.answer);});
   answer.textContent=(i===item.answer?'Richtig! ':'Fast! ')+item.explanation;answer.hidden=false;
  });choices.append(b);});body.append(choices,answer);
 }else body.append(el('p',item.note,'advent-prompt-note'));
 if(n){opened.add(n);if(!writeOpened(storage,opened))body.append(el('p','Dein Browser kann den Fortschritt gerade nicht speichern. Die Türchen funktionieren trotzdem.','advent-prompt-note'));render();}
 $('adventDialog').showModal();$('adventClose').focus();
}
function close(){ $('adventDialog').close(); }
$('adventClose').addEventListener('click',close);$('adventDone').addEventListener('click',close);
$('adventDialog').addEventListener('close',()=>{const n=lastTrigger?.dataset.day;(n?document.querySelector(`[data-day="${n}"]`):lastTrigger)?.focus();});
$('adventDialog').addEventListener('click',e=>{if(e.target===$('adventDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
$('adventSample').addEventListener('click',e=>openDoor(null,e.currentTarget));
$('adventToday').addEventListener('click',e=>{const today=calendarState().today;if(today)openDoor(today,e.currentTarget);});
// Only decorative: no requests, no canvas, and no input interception.
const motion=matchMedia('(prefers-reduced-motion: reduce)');
let snowEnabled=true;try{snowEnabled=storage.getItem('advent-snow')!=='0';}catch{}
const snow=el('div',null,'advent-snow');snow.setAttribute('aria-hidden','true');
for(let i=0;i<18;i++){const flake=el('span','•');flake.style.setProperty('--x',`${(i*37)%100}%`);flake.style.setProperty('--duration',`${14+i%7*2}s`);flake.style.setProperty('--delay',`${-i*3}s`);flake.style.setProperty('--size',`${3+i%3*2}px`);snow.append(flake);}document.body.prepend(snow);
function updateSnow(){const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',month:'2-digit'}).format(new Date());const season=date==='12';snow.hidden=!season||!snowEnabled||motion.matches;$('adventSnow').hidden=!season;$('adventSnow').setAttribute('aria-pressed',String(snowEnabled));$('adventSnow').textContent=snowEnabled?'Schnee an':'Schnee aus';snow.classList.toggle('paused',document.hidden);}
$('adventSnow').addEventListener('click',()=>{snowEnabled=!snowEnabled;try{storage.setItem('advent-snow',snowEnabled?'1':'0');}catch{}updateSnow();});
motion.addEventListener('change',updateSnow);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();else updateSnow();});
window.addEventListener('storage',e=>{if(e.key==='advent-opened-'+CALENDAR_YEAR){opened=readOpened(storage);render();}});
// Refresh availability over midnight without interrupting an open door or keyboard focus.
let available=calendarState().available;
setInterval(()=>{const next=calendarState().available;if(next!==available){available=next;render();}else updateSnow();},30000);
render();
