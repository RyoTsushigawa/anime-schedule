(() => {
let source = null, target = null, dragWeek = null, touch = null;
let cardTouch = null, holdTimer = null;
const hint = $('dragHint');
const line = document.createElement('div');
line.className = 'drop-line'; line.hidden = true; line.setAttribute('aria-hidden', 'true');
document.body.append(line);
function showLine(day, y, time) {
const box = day.getBoundingClientRect();
line.style.top = `${Math.round(y)}px`; line.style.left = `${Math.round(box.left)}px`; line.style.width = `${Math.round(box.width)}px`;
line.dataset.time = time || 'frei';
line.hidden = false;
}
const allowed = () => canMove() && view === 'week' && !document.body.classList.contains('no-move');
function prepareCards() {
if (!globalThis.document?.documentElement) { observer.disconnect(); return; }
for (const row of document.querySelectorAll('#list .row')) {
const on = allowed() && !!row.querySelector('button.move:not([data-extra])');
row.draggable = on; row.classList.toggle('move-card',on);
}
}
const observer = new MutationObserver(prepareCards);
observer.observe($('list'),{childList:true,subtree:true});
observer.observe(document.body,{attributes:true,attributeFilter:['class']});
prepareCards();
function cardSource(element) {
if (element?.closest?.('button:not(.move), input, select, textarea, .links a')) return null;
return element?.closest?.('#list .row')?.querySelector('button.move:not([data-extra])') || null;
}
function clean(suppress = false) {
clearTimeout(holdTimer); holdTimer = null; cardTouch = null;
document.querySelectorAll('.drop-day,.drop-slot,.drop-before,.drop-after,.move-dragging').forEach(el=>el.classList.remove('drop-day','drop-slot','drop-before','drop-after','move-dragging'));
document.body.classList.remove('dnd-moving'); hint.hidden = true; line.hidden = true;
source = null; target = null; touch = null;
if (suppress) { document.body.dataset.suppressMoveClick = '1'; setTimeout(()=>delete document.body.dataset.suppressMoveClick,400); }
}
function begin(button) {
if (!allowed() || button.disabled || !button.isConnected) return false;
source = button; dragWeek = weekOffset;
button.closest('.row')?.classList.add('move-dragging');
document.body.classList.add('dnd-moving');
return true;
}
const minutes = row => { const hm = parseTime(row?.dataset.watchTime); return hm ? (hm[0] < NIGHT_UNTIL ? hm[0]+24 : hm[0])*60+hm[1] : null; };
const clock = n => n === null || n < 0 || n >= 30*60 ? '' : `${String(Math.floor(n/60)%24).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const between = (a, b, before) => a === null && b === null ? 19*60 : before ? (b ?? a+60)-30 : (a ?? b+60)+30;
function destination(element, y) {
const day = element?.closest?.('#list .day[data-move-day]');
if (!day) return null;
const tag = day.dataset.moveDay;
const rows = [...day.querySelectorAll('.row[data-watch-time]')].filter(r=>!r.contains(source));
const row = element.closest('.row[data-watch-time]');
if (row?.contains(source)) return null;
if (row) {
const box = row.getBoundingClientRect(), f = box.height && y !== undefined ? (y-box.top)/box.height : .5;
if (f > .25 && f < .75) return {day,row,tag,time:row.dataset.watchTime,parallel:true,mark:'drop-slot'};
const i = rows.indexOf(row), before = f <= .25;
const at = before ? between(minutes(rows[i-1]), minutes(row), true) : between(minutes(row), minutes(rows[i+1]), false);
const time = clock(at), shared = rows.some(r => minutes(r) === at);
return {day,row,tag,time,parallel:shared,mark:before ? 'drop-before' : 'drop-after'};
}
const times = rows.map(minutes).filter(n=>n!==null);
return {day,row:null,tag,time:clock(between(times.length ? Math.max(...times) : null, null, false)),parallel:false,mark:'drop-day'};
}
function hover(element, y) {
document.querySelectorAll('.drop-day,.drop-slot,.drop-before,.drop-after').forEach(el=>el.classList.remove('drop-day','drop-slot','drop-before','drop-after'));
target = destination(element, y);
line.hidden = true;
if (!target) return;
line.classList.toggle('beside', target.parallel);
if (target.parallel && target.mark === 'drop-slot') {
target.row.classList.add('drop-slot');
showLine(target.row, target.row.getBoundingClientRect().top, `${target.time} · daneben`);
} else {
const rows = [...target.day.querySelectorAll('.row')].filter(r=>!r.contains(source));
const last = rows.at(-1)?.getBoundingClientRect(), head = target.day.querySelector('h2').getBoundingClientRect();
const box = target.row?.getBoundingClientRect();
const at = target.mark === 'drop-before' ? box.top - 5 : target.mark === 'drop-after' ? box.bottom + 4 : (last ? last.bottom + 4 : head.bottom + 4);
showLine(target.day, at, target.parallel ? target.time + ' · daneben' : target.time);
}
}
function drop() {
const button = source, to = target;
const valid = allowed() && weekOffset === dragWeek;
clean(true);
if (valid && button && to) placeByDrag(button,{tag:to.tag,time:to.time,parallel:to.parallel});
}
$('list').addEventListener('dragstart',event=>{
const button = cardSource(event.target);
if (!button || !begin(button)) { if (allowed()) event.preventDefault(); return; }
event.dataTransfer?.setData('text/plain',button.dataset.moveTitle);
if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
});
$('list').addEventListener('dragover',event=>{
if (!source || !allowed()) return;
hover(event.target, event.clientY);
if (target) {event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect='move';}
});
$('list').addEventListener('drop',event=>{if (!source) return;event.preventDefault();hover(event.target, event.clientY);drop();});
document.addEventListener('dragend',()=>{if (source) clean(true);});
$('list').addEventListener('pointerdown',event=>{
if (event.pointerType === 'mouse' || !allowed()) return;
const button = event.target.closest?.('button.move:not([data-extra])');
if (!button || button.disabled) return;
touch = {button,x:event.clientX,y:event.clientY,id:event.pointerId,active:false};
button.setPointerCapture?.(event.pointerId);
});
document.addEventListener('pointermove',event=>{
if (!touch || event.pointerId !== touch.id) return;
if (!touch.active && Math.hypot(event.clientX-touch.x,event.clientY-touch.y)>8) touch.active=begin(touch.button);
if (!touch?.active) return;
event.preventDefault();
hover(document.elementFromPoint(event.clientX,event.clientY), event.clientY);
if (event.clientY<100) scrollBy(0,-16); else if (event.clientY>innerHeight-80) scrollBy(0,16);
},{passive:false});
document.addEventListener('pointerup',event=>{
if (!touch || event.pointerId!==touch.id) return;
const active=touch.active;
if (active) {event.preventDefault();hover(document.elementFromPoint(event.clientX,event.clientY), event.clientY);drop();} else touch=null;
});
document.addEventListener('pointercancel',()=>{if(touch) clean(true);});
$('list').addEventListener('touchstart',event=>{
if (!allowed() || event.touches.length!==1 || event.target.closest('a,button,input,select,textarea')) return;
const button = cardSource(event.target), point=event.touches[0];
if (!button) return;
cardTouch={button,x:point.clientX,y:point.clientY,active:false};
holdTimer=setTimeout(()=>{if(cardTouch) cardTouch.active=begin(button);},300);
},{passive:true});
document.addEventListener('touchmove',event=>{
if (!cardTouch || !event.touches.length) return;
const point=event.touches[0];
if (!cardTouch.active) {
if (Math.hypot(point.clientX-cardTouch.x,point.clientY-cardTouch.y)>8) {clearTimeout(holdTimer);cardTouch=null;}
return;
}
event.preventDefault(); hover(document.elementFromPoint(point.clientX,point.clientY), point.clientY);
if(point.clientY<100) scrollBy(0,-16); else if(point.clientY>innerHeight-80) scrollBy(0,16);
},{passive:false});
document.addEventListener('touchend',event=>{
if(!cardTouch) return;
clearTimeout(holdTimer);
if(cardTouch.active) {
event.preventDefault(); const point=event.changedTouches[0];
if(point) hover(document.elementFromPoint(point.clientX,point.clientY), point.clientY);
drop();
} else cardTouch=null;
},{passive:false});
document.addEventListener('touchcancel',()=>{if(cardTouch) clean(true);});
document.addEventListener('contextmenu',event=>{if(cardTouch?.active) event.preventDefault();});
document.addEventListener('click',event=>{
if(document.body.dataset.suppressMoveClick && event.target.closest?.('#list .row')) {event.preventDefault();event.stopPropagation();}
},true);
document.addEventListener('keydown',event=>{if(event.key==='Escape' && source){event.preventDefault();clean(true);}});
})();

