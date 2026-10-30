// Dragging only chooses a destination. The existing shared-move dialog confirms the write.
(() => {
  let source = null, target = null, dragWeek = null, touch = null;
  const hint = $('dragHint');
  const allowed = () => !!movesKey && view === 'week' && !document.body.classList.contains('no-move');
  function clean(suppress = false) {
    document.querySelectorAll('.drop-day,.drop-slot,.move-dragging').forEach(el=>el.classList.remove('drop-day','drop-slot','move-dragging'));
    document.body.classList.remove('dnd-moving'); hint.hidden = true;
    source = null; target = null; touch = null;
    if (suppress) { document.body.dataset.suppressMoveClick = '1'; setTimeout(()=>delete document.body.dataset.suppressMoveClick,400); }
  }
  function begin(button) {
    if (!allowed() || button.disabled || !button.isConnected) return false;
    source = button; dragWeek = weekOffset;
    button.closest('.row')?.classList.add('move-dragging');
    document.body.classList.add('dnd-moving');
    hint.textContent = 'Drop on a day to add a slot, or on a show to share its slot. Nothing saves until you confirm.';
    hint.hidden = false; return true;
  }
  function destination(element) {
    const day = element?.closest?.('#list .day[data-move-day]');
    if (!day) return null;
    const row = element.closest('.row[data-watch-time]');
    if (row?.contains(source)) return null;
    let time = row?.dataset.watchTime;
    if (!time) {
      const times = [...day.querySelectorAll('.row[data-watch-time]')].filter(r=>!r.contains(source)).map(r=>parseTime(r.dataset.watchTime))
        .filter(Boolean).map(([h,m])=>(h < NIGHT_UNTIL ? h+24 : h)*60+m);
      const next = times.length ? Math.max(...times)+30 : 19*60;
      time = next < 30*60 ? `${String(Math.floor(next/60)%24).padStart(2,'0')}:${String(next%60).padStart(2,'0')}` : '';
    }
    return {day,row,tag:day.dataset.moveDay,time,parallel:!!row};
  }
  function hover(element) {
    document.querySelectorAll('.drop-day,.drop-slot').forEach(el=>el.classList.remove('drop-day','drop-slot'));
    target = destination(element);
    if (!target) return;
    (target.row || target.day).classList.add(target.row ? 'drop-slot' : 'drop-day');
    hint.textContent = `${target.tag} ${target.time || 'next free slot'}${target.parallel ? ' · parallel slot' : ''} — release to review`;
  }
  function drop() {
    const button = source, to = target;
    const valid = allowed() && weekOffset === dragWeek;
    clean(true);
    if (valid && button && to) openMoveDialog(button,{tag:to.tag,time:to.time,parallel:to.parallel});
  }
  $('list').addEventListener('dragstart',event=>{
    const button = event.target.closest?.('button.move');
    if (!button || !begin(button)) return;
    event.dataTransfer?.setData('text/plain',button.dataset.moveTitle);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  });
  $('list').addEventListener('dragover',event=>{
    if (!source || !allowed()) return;
    hover(event.target);
    if (target) {event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect='move';}
  });
  $('list').addEventListener('drop',event=>{if (!source) return;event.preventDefault();hover(event.target);drop();});
  document.addEventListener('dragend',()=>{if (source) clean(true);});
  $('list').addEventListener('pointerdown',event=>{
    if (event.pointerType === 'mouse' || !allowed()) return;
    const button = event.target.closest?.('button.move');
    if (!button || button.disabled) return;
    touch = {button,x:event.clientX,y:event.clientY,id:event.pointerId,active:false};
    button.setPointerCapture?.(event.pointerId);
  });
  document.addEventListener('pointermove',event=>{
    if (!touch || event.pointerId !== touch.id) return;
    if (!touch.active && Math.hypot(event.clientX-touch.x,event.clientY-touch.y)>8) touch.active=begin(touch.button);
    if (!touch?.active) return;
    event.preventDefault();
    hover(document.elementFromPoint(event.clientX,event.clientY));
    if (event.clientY<100) scrollBy(0,-16); else if (event.clientY>innerHeight-80) scrollBy(0,16);
  },{passive:false});
  document.addEventListener('pointerup',event=>{
    if (!touch || event.pointerId!==touch.id) return;
    const active=touch.active;
    if (active) {event.preventDefault();hover(document.elementFromPoint(event.clientX,event.clientY));drop();} else touch=null;
  });
  document.addEventListener('pointercancel',()=>{if(touch) clean(true);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape' && source){event.preventDefault();clean(true);}});
})();
