// Optional, read-only onboarding. The tour never clicks an account/progress/edit control.
(() => {
  const guide = $('helpDialog'), tour = $('tourDialog');
  let savedScroll = 0, step = 0, steps = [], highlighted = null;
  function clearHighlight() { highlighted?.classList.remove('tour-highlight'); highlighted = null; }
  function position() {
    if (!tour.open || !highlighted?.isConnected) return;
    const box = highlighted.getBoundingClientRect(), panel = tour.getBoundingClientRect();
    const below = box.bottom + 12;
    const top = below + panel.height < innerHeight - 12 ? below : box.top - panel.height - 12 > 12 ? box.top - panel.height - 12 : innerHeight - panel.height - 12;
    tour.style.top = Math.max(12, top) + 'px';
    tour.style.left = Math.max(12, Math.min(innerWidth - panel.width - 12, box.left + box.width / 2 - panel.width / 2)) + 'px';
  }
  function showStep() {
    clearHighlight();
    const current = steps[step];
    highlighted = current.target;
    highlighted.classList.add('tour-highlight');
    highlighted.scrollIntoView?.({ block:'center', inline:'nearest', behavior:'auto' });
    document.querySelector('header').classList.remove('away');
    $('tourProgress').textContent = `${step + 1} of ${steps.length}`;
    $('tourTitle').textContent = current.title;
    $('tourText').textContent = current.text;
    $('tourBack').disabled = step === 0;
    $('tourNext').textContent = step === steps.length - 1 ? 'Finish' : 'Next';
    position();
    $('tourNext').focus({preventScroll:true});
  }
  $('helpButton').onclick = () => {
    showSettings(false); showPeople(false); showMenu('accountMenu','accountButton',false);
    guide.showModal();
  };
  $('helpClose').onclick = () => guide.close();
  guide.addEventListener('close', () => { if (!tour.open) $('helpButton').focus({preventScroll:true}); });
  $('helpShortcuts').onclick = () => { guide.close(); openKeyboardHelp(); };
  $('helpTour').onclick = () => {
    guide.close(); savedScroll = scrollY; step = 0;
    steps = [
      {target:$('viewWeek').parentElement,title:'Three ways to use the schedule',text:'Week is the group plan. Catch-up finds missed seasonals. Non-seasonal is for older shows you are watching at your own pace.'},
      {target:mode === 'group' ? $('groupButton') : $('soloPerson'),title:'Whose plan?',text:'Solo selects one person. Group combines selected people. If nobody is selected, the schedule is empty.'},
      {target:document.querySelector('.weeknav'),title:'Choose when',text:'The arrows change weeks. Today shows just today; From today hides earlier days. Search still checks the whole week.'},
      {target:document.querySelector('#list .row') || $('list'),title:'Open a show, then tick it',text:'Service buttons open the show. With an account connected, ✓ sets progress up to that episode. Undo at the bottom, or Ctrl/⌘+Z, reverses a mistake.'},
      {target:$('accountButton'),title:'Your lists live here',text:'Connect AniList or MyAnimeList here. Once both are connected, choose a matching account and enable Sync both lists for new actions made in this schedule.'},
      {target:$('settingsButton'),title:'Display preferences',text:'Change links, viewers, time and colour here. More options holds refresh, backup and keyboard shortcuts.'},
      {target:$('editSchedule'),title:'Move shows together',text:'Edit schedule reveals the ⇄ handles. Drag one to a day or time slot, then confirm. A shared slot means parallel shows. Everyone sees a saved move.'},
      {target:document.querySelector('.site-tools'),title:'Other tools',text:'The watch planner and Higher / Lower ranker are down here. You can reopen this guide from the question mark any time.'},
    ].filter(s => s.target && !s.target.hidden && s.target.getClientRects().length && getComputedStyle(s.target).display !== 'none');
    if (!steps.length) { guide.showModal(); return; }
    document.body.classList.add('touring');
    tour.showModal(); showStep();
  };
  $('tourNext').onclick = () => step + 1 < steps.length ? (step++,showStep()) : tour.close();
  $('tourBack').onclick = () => { if (step > 0) { step--; showStep(); } };
  $('tourStop').onclick = () => tour.close();
  tour.addEventListener('close', () => {
    clearHighlight(); document.body.classList.remove('touring'); scrollTo(0,savedScroll);
    $('helpButton').focus({preventScroll:true});
  });
  addEventListener('resize',position);
})();
