// ---------- Watch plan generator ----------
// Suggests a weekly watch plan for a Guckplan tab: the day, slot and time for each show, and which
// shows run side by side (people with nobody in common watching different shows in the same slot,
// like a show's name written in someone's column). It only shows the suggestion and copies it as a
// table; nothing is written to the sheet.
//
// The group's rules: every day from 19:00 in 30-minute slots. A show is planned for everyone with
// Ja / Vielleicht / Wenn Belly dabei ist / a group name like "Demons" (as picks() reads the sheet).
// Shows stay on their release day where possible, never before they're out. Some people can't make
// some weekdays (Belly: never Mondays). Best plan = fewest breaks for every person (slots between
// their first and last show of an evening where they watch nothing), then the fewest shows moved
// off their release day, then short evenings (as many side-by-side pairs as possible).
// Its own page (planner.html), opened in a new tab from the schedule's ⚙ menu; uses common.js.

const PLAN_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const PLAN_DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SHEET_DAYS = ['Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.', 'So.'];
const SLOT_LENGTH = 30;
// How much each thing counts against a plan. "hard" = not allowed (someone can't that day, or the
// episode isn't out yet at that slot); a break costs more the more one person has in an evening.
const PLAN_COST = { hard: 1000, gap: 30, gapSquared: 6, delay: 12, keep: 2, slot: 4 };
const EVERYONE = '*'; // planUnavailable key for days the whole group has off

let planUnavailable = { Belly: [0] }; // person → weekdays (0 = Monday) they can't make
let planStart = '19:00';
try {
  planUnavailable = JSON.parse(localStorage.getItem('planUnavailable')) || planUnavailable;
  planStart = localStorage.getItem('planStart') || planStart;
} catch {}
let planTabGid = null;
const planCache = new Map(); // tab gid → planner data
let planOutcome = null;
let tabs = [];
let streamsDe = null;

// The schedule's look in this browser (light/dark, accent color), read only.
try {
  const theme = localStorage.getItem('theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  const accent = localStorage.getItem('accent');
  if (/^#[0-9a-f]{6}$/i.test(accent || '')) document.documentElement.style.setProperty('--accent', accent);
} catch {}

let noticeTimer = null;
function notice(text) {
  $('noticeText').textContent = text;
  $('notice').hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 3000);
}

const ready = Promise.all([
  fetch('streams-de.json', { cache: 'no-cache' }).then(r => r.json()).then(json => { streamsDe = json; }, () => {}),
  guckplanTabs().then(list => { tabs = list; }, e => console.warn('Sheet tabs not loaded:', e)),
]);

const minutesOf = time => {
  const hm = parseTime(time);
  return hm ? (hm[0] < NIGHT_UNTIL ? hm[0] + 24 : hm[0]) * 60 + hm[1] : null;
};
const clock = min => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const dayIndex = tag => WEEKDAYS.indexOf(norm(tag).slice(0, 2));

// ---------- Data: who watches what, and when each show comes out ----------

async function plannerData(tab) {
  if (planCache.has(tab.gid)) return planCache.get(tab.gid);
  const sheet = await loadPlan(tab);
  rememberColors([sheet]);
  // Everyone who watches each show (named shows included), and the slot it has in the sheet now.
  const byShow = new Map();
  for (const person of sheet.people)
    for (const [show, slot] of picks(sheet, person)) {
      const entry = byShow.get(show) || { show, people: [], slot };
      entry.people.push(person);
      if (!entry.slot?.tag && slot.tag) entry.slot = slot;
      byShow.set(show, entry);
    }
  const entries = [...byShow.values()];
  const media = await plannerMedia(entries.map(e => e.show));
  const people = sheet.people.filter(p => entries.some(e => e.people.includes(p)));
  const shows = entries.map((e, i) => {
    const m = media[i];
    const next = m?.nextAiringEpisode;
    let release = null;
    if (next) {
      const out = new Date((next.airingAt + (streamsDe?.release?.[m.id]?.offset || 0)) * 1000);
      release = { day: (out.getDay() + 6) % 7, min: out.getHours() * 60 + out.getMinutes() };
    }
    const day = dayIndex(e.slot?.tag);
    return {
      title: m?.title?.english || e.show.english || e.show.romaji || m?.title?.romaji,
      sheetTitle: e.show.romaji || e.show.english,
      people: e.people,
      mask: e.people.reduce((mask, p) => mask | (1 << people.indexOf(p)), 0),
      release,
      short: !!m?.duration && m.duration <= 15,
      current: day >= 0 ? { day, min: minutesOf(e.slot.time) } : null,
    };
  });
  const data = { tab, people, shows };
  planCache.set(tab.gid, data);
  return data;
}

// Each show's AniList entry (episode length, next episode): by id where the weekly LiveChart data
// knows the show, else by searching its title among airing and upcoming shows.
async function plannerMedia(shows) {
  const fields = 'id duration title { romaji english } nextAiringEpisode { airingAt }';
  const idOf = show => Object.entries(streamsDe?.status || {})
    .find(([, s]) => titleMatches([show.romaji, show.english], s.titles))?.[0];
  const ids = shows.map(idOf).map(Number);
  const result = new Array(shows.length).fill(null);
  const known = [...new Set(ids.filter(Boolean))];
  if (known.length) {
    const data = await anilist(`query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) { ${fields} } } }`, { ids: known });
    for (const m of data.Page.media) ids.forEach((id, i) => { if (id === m.id) result[i] = m; });
  }
  const missing = shows.flatMap((s, i) => ids[i] ? [] : [i]);
  for (let at = 0; at < missing.length; at += 15) {
    const batch = missing.slice(at, at + 15);
    const query = `query (${batch.map(i => `$t${i}: String`).join(', ')}) {${batch.map(i =>
      ` s${i}: Page(perPage: 1) { media(search: $t${i}, type: ANIME, status_in: [RELEASING, NOT_YET_RELEASED], sort: SEARCH_MATCH) { ${fields} } }`).join('')} }`;
    const data = await anilist(query, Object.fromEntries(batch.map(i => [`t${i}`, shows[i].romaji || shows[i].english])));
    for (const i of batch) result[i] = data[`s${i}`]?.media?.[0] || null;
  }
  return result;
}

// ---------- The plan and what it costs ----------
// A plan: seven days (Monday first), each an array of slots in order; a slot holds one show, or
// two shows watched side by side by people with nobody in common. Shows are indexes into data.shows.

function planContext(data) {
  const off = d => (planUnavailable[EVERYONE] || []).includes(d);
  const dayMask = [0, 1, 2, 3, 4, 5, 6].map(d => data.people.reduce((mask, p, i) =>
    off(d) || (planUnavailable[p] || []).includes(d) ? mask | (1 << i) : mask, 0));
  return { shows: data.shows, people: data.people, dayMask, start: minutesOf(planStart) ?? 19 * 60 };
}

// The cost, and with `details` everything the result page shows.
function planCost(plan, ctx, details = false) {
  const { shows, dayMask, start, people } = ctx;
  let cost = 0, breaks = 0, moved = 0, hard = 0;
  const personBreaks = details ? people.map(() => []) : null;
  const problems = details ? [] : null;
  for (let d = 0; d < 7; d++) {
    const slots = plan[d];
    cost += PLAN_COST.slot * slots.length;
    const masks = slots.map(slot => slot.reduce((mask, i) => mask | shows[i].mask, 0));
    for (let k = 0; k < slots.length; k++)
      for (const i of slots[k]) {
        const s = shows[i];
        if (s.mask & dayMask[d]) {
          cost += PLAN_COST.hard; hard++;
          if (details) problems.push(`${s.title}: ${people.filter((p, b) => s.mask & dayMask[d] & (1 << b)).join(', ')} can't on ${PLAN_DAYS[d]}`);
        }
        if (s.release) {
          const delay = (d - s.release.day + 7) % 7;
          if (delay === 0 && start + SLOT_LENGTH * k < s.release.min) {
            cost += PLAN_COST.hard; hard++;
            if (details) problems.push(`${s.title}: only out at ${clock(s.release.min)}`);
          }
          if (delay) { cost += PLAN_COST.delay * delay; moved++; }
        }
        if (s.current && s.current.day !== d) cost += PLAN_COST.keep;
      }
    for (let p = 0; p < people.length; p++) {
      const bit = 1 << p;
      let first = -1, last = -1, count = 0;
      for (let k = 0; k < masks.length; k++)
        if (masks[k] & bit) { if (first < 0) first = k; last = k; count++; }
      const gaps = first < 0 ? 0 : last - first + 1 - count;
      if (!gaps) continue;
      cost += PLAN_COST.gap * gaps + PLAN_COST.gapSquared * gaps * gaps;
      breaks += gaps;
      if (details) personBreaks[p].push({ day: d, gaps });
    }
  }
  return details ? { cost, breaks, moved, hard, personBreaks, problems } : cost;
}

// Start: every show on its release day (or the next day everyone can), in release order.
function startPlan(ctx, shuffle) {
  const plan = [[], [], [], [], [], [], []];
  const order = ctx.shows.map((s, i) => i);
  if (shuffle) order.sort(() => Math.random() - 0.5);
  for (const i of order) {
    const s = ctx.shows[i];
    let d = s.release ? s.release.day : s.current ? s.current.day : Math.floor(Math.random() * 7);
    for (let t = 0; t < 7 && (s.mask & ctx.dayMask[d]); t++) d = (d + 1) % 7;
    plan[d].push([i]);
  }
  for (const day of plan) day.sort((a, b) => (ctx.shows[a[0]].release?.min ?? 0) - (ctx.shows[b[0]].release?.min ?? 0));
  return plan;
}

// One random change: move a show (to another slot or day, alone or next to another show), swap two
// slots of an evening, or swap two shows. Null when the change isn't possible.
function changePlan(plan, ctx) {
  const next = plan.map(day => day.map(slot => slot.slice()));
  const { shows } = ctx;
  const where = i => {
    for (let d = 0; d < 7; d++)
      for (let k = 0; k < next[d].length; k++)
        if (next[d][k].includes(i)) return [d, k];
  };
  const fits = (slot, i) => slot.length === 1 && !(shows[slot[0]].mask & shows[i].mask);
  const r = Math.random();
  if (r < 0.6) {
    const i = Math.floor(Math.random() * shows.length);
    const [d, k] = where(i);
    next[d][k].splice(next[d][k].indexOf(i), 1);
    if (!next[d][k].length) next[d].splice(k, 1);
    const s = shows[i];
    const pick = Math.random();
    const to = pick < 0.5 ? d : pick < 0.8 && s.release ? (s.release.day + Math.floor(Math.random() * 2)) % 7 : Math.floor(Math.random() * 7);
    const partners = next[to].flatMap((slot, j) => fits(slot, i) ? [j] : []);
    if (partners.length && Math.random() < 0.45) next[to][partners[Math.floor(Math.random() * partners.length)]].push(i);
    else next[to].splice(Math.floor(Math.random() * (next[to].length + 1)), 0, [i]);
  } else if (r < 0.8) {
    const d = Math.floor(Math.random() * 7);
    if (next[d].length < 2) return null;
    const a = Math.floor(Math.random() * next[d].length), b = Math.floor(Math.random() * next[d].length);
    if (a === b) return null;
    [next[d][a], next[d][b]] = [next[d][b], next[d][a]];
  } else {
    const a = Math.floor(Math.random() * shows.length), b = Math.floor(Math.random() * shows.length);
    const [da, ka] = where(a), [db, kb] = where(b);
    if (da === db && ka === kb) return null;
    const sa = next[da][ka], sb = next[db][kb];
    sa[sa.indexOf(a)] = b;
    sb[sb.indexOf(b)] = a;
    if ((sa.length === 2 && shows[sa[0]].mask & shows[sa[1]].mask) || (sb.length === 2 && shows[sb[0]].mask & shows[sb[1]].mask)) return null;
  }
  return next;
}

// Simulated annealing: many random changes, worse ones accepted less and less often; a few fresh
// starts, the best plan wins. Pauses now and then so the page stays responsive.
async function findPlan(ctx, onProgress) {
  const RUNS = 4, STEPS = 80000;
  let best = null, bestCost = Infinity;
  for (let run = 0; run < RUNS; run++) {
    let plan = startPlan(ctx, run > 0);
    let cost = planCost(plan, ctx);
    for (let step = 0; step < STEPS; step++) {
      if (step % 5000 === 0) { onProgress((run * STEPS + step) / (RUNS * STEPS)); await new Promise(r => setTimeout(r)); }
      const temperature = 40 * Math.pow(0.2 / 40, step / STEPS);
      const next = changePlan(plan, ctx);
      if (!next) continue;
      const c = planCost(next, ctx);
      if (c <= cost || Math.random() < Math.exp((cost - c) / temperature)) {
        plan = next; cost = c;
        if (c < bestCost) { best = next; bestCost = c; }
      }
    }
  }
  return best || startPlan(ctx, false);
}

// The plan in the Guckplan now (Tag + Uhrzeit), for comparison: one slot per 30 minutes from each
// evening's first show, shows at the same time side by side. Null when most shows have no day yet.
function currentPlan(ctx) {
  const placed = ctx.shows.map((s, i) => ({ s, i })).filter(({ s }) => s.current && s.current.min !== null);
  if (placed.length < ctx.shows.length / 2) return null;
  const plan = [[], [], [], [], [], [], []];
  for (let d = 0; d < 7; d++) {
    const today = placed.filter(({ s }) => s.current.day === d);
    if (!today.length) continue;
    const first = Math.min(...today.map(({ s }) => s.current.min));
    for (const { s, i } of today) {
      const k = Math.round((s.current.min - first) / SLOT_LENGTH);
      while (plan[d].length <= k) plan[d].push([]);
      plan[d][k].push(i);
    }
  }
  return { plan, missing: ctx.shows.length - placed.length };
}

// ---------- The planner page ----------

async function loadPlanner() {
  await ready;
  const tab = tabs.find(t => t.gid === planTabGid) || tabs[0] || FALLBACK_TAB;
  planTabGid = tab.gid;
  $('list').innerHTML = `<div class="status">Reading ${esc(tab.name)} and looking up release times…</div>`;
  let data;
  try {
    data = await plannerData(tab);
  } catch (e) {
    $('list').innerHTML = `<div class="status">Couldn't load the plan data (${esc(e.message)}).</div>`;
    return;
  }
  // Accent "person" (the schedule's default): the schedule's Solo person's Guckplan color.
  try {
    const color = personColor.get(localStorage.getItem('soloPerson') || DEFAULT_PERSON);
    if ((localStorage.getItem('accent') || 'person') === 'person' && color) {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
      document.documentElement.style.setProperty('--accent', color);
      document.documentElement.style.setProperty('--accent-text', 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111' : '#fff');
    }
  } catch {}
  $('list').innerHTML = plannerSetup(data) + '<div id="planOut"></div>';
  bindPlannerSetup(data);
  if (planOutcome?.tab === tab.gid) showPlan(data, planOutcome.plan);
  else generatePlan(data);
}

function plannerSetup(data) {
  const tabOptions = (tabs.length ? tabs : [FALLBACK_TAB]).map(t =>
    `<option value="${esc(t.gid)}"${t.gid === data.tab.gid ? ' selected' : ''}>${esc(t.name)}</option>`).join('');
  // "Everyone" first (days off for the whole group), then each person.
  const grid = [EVERYONE, ...data.people].map(p => `
    <span class="avail-name${p === EVERYONE ? ' everyone' : ''}" style="${p === EVERYONE ? '' : personStyle(p)}">${p === EVERYONE ? 'Everyone' : esc(p)}</span>${PLAN_DAYS_SHORT.map((day, d) =>
      `<button class="avail-day" data-person="${esc(p)}" data-day="${d}" aria-pressed="${(planUnavailable[p] || []).includes(d)}"
        title="${p === EVERYONE ? 'Nobody watches' : esc(p) + " can't"} on ${PLAN_DAYS[d]}">${day.slice(0, 2)}</button>`).join('')}`).join('');
  return `<section class="plan-card">
    <div class="plan-head">
      <select id="planTab" class="pill" aria-label="Guckplan tab">${tabOptions}</select>
      <label class="plan-start">Start <input id="planStart" class="pill" type="time" value="${esc(planStart)}"></label>
      <button id="planRun" class="pill plan-go">Generate plan</button>
    </div>
    <div class="menu-label">Who can't when <span class="plan-hint">· tap a day to mark it</span></div>
    <div class="avail">${grid}</div>
  </section>`;
}

function bindPlannerSetup(data) {
  $('planTab').onchange = () => { planTabGid = $('planTab').value; planOutcome = null; loadPlanner(); };
  $('planStart').onchange = () => {
    planStart = $('planStart').value || '19:00';
    try { localStorage.setItem('planStart', planStart); } catch {}
  };
  for (const b of document.querySelectorAll('.avail-day'))
    b.onclick = () => {
      const days = new Set(planUnavailable[b.dataset.person] || []);
      const d = Number(b.dataset.day);
      days.has(d) ? days.delete(d) : days.add(d);
      planUnavailable[b.dataset.person] = [...days].sort();
      b.setAttribute('aria-pressed', days.has(d));
      try { localStorage.setItem('planUnavailable', JSON.stringify(planUnavailable)); } catch {}
    };
  $('planRun').onclick = () => generatePlan(data);
}

async function generatePlan(data) {
  const out = $('planOut');
  if (!out) return;
  if (!data.shows.length) { out.innerHTML = '<div class="status">Nobody has picked any show in this tab yet.</div>'; return; }
  $('planRun').disabled = true;
  out.innerHTML = '<div class="status">Trying out plans… <span id="planProgress">0%</span></div>';
  const ctx = planContext(data);
  const plan = await findPlan(ctx, f => { const el = $('planProgress'); if (el) el.textContent = Math.round(f * 100) + '%'; });
  if (!$('planOut')) return;
  $('planRun').disabled = false;
  planOutcome = { tab: data.tab.gid, plan };
  showPlan(data, plan);
}

function showPlan(data, plan) {
  const ctx = planContext(data);
  const result = planCost(plan, ctx, true);
  const now = currentPlan(ctx);
  const nowResult = now && planCost(now.plan, ctx, true);
  const { shows, start } = ctx;
  const ends = plan.map(day => day.length ? start + SLOT_LENGTH * day.length : null).filter(Boolean);
  const pairs = plan.flat().filter(slot => slot.length === 2).length;
  const tile = (value, label, was) => `<div class="plan-tile"><b>${value}</b><span>${label}</span>${was !== undefined ? `<small>now ${was}</small>` : ''}</div>`;
  const stats = `<div class="plan-stats">
    ${tile(result.breaks, result.breaks === 1 ? 'break' : 'breaks', nowResult?.breaks)}
    ${tile(result.moved, 'moved off release day')}
    ${tile(pairs, pairs === 1 ? 'side-by-side pair' : 'side-by-side pairs')}
    ${tile(ends.length ? clock(Math.max(...ends)) : '–', 'latest end')}
  </div>`;
  const problems = result.problems.length ? `<details class="warning" open><summary>${result.problems.length} ${result.problems.length === 1 ? "show doesn't" : "shows don't"} fit anywhere cleanly</summary>
    <ul>${result.problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul></details>` : '';
  const chips = people => `<span class="who">${people.map(p => `<span style="${personStyle(p)}">${esc(p)}</span>`).join('')}</span>`;
  const showInfo = (i, d) => {
    const s = shows[i];
    const notes = [];
    if (s.release) {
      notes.push(`out ${PLAN_DAYS_SHORT[s.release.day]} ${clock(s.release.min)}`);
      const delay = (d - s.release.day + 7) % 7;
      if (delay) {
        const cant = data.people.filter((p, b) => s.mask & ctx.dayMask[s.release.day] & (1 << b));
        notes.push(`<span class="plan-moved">moved +${delay} ${delay === 1 ? 'day' : 'days'}${cant.length ? ` (${esc(cant.join(', '))} can't ${PLAN_DAYS_SHORT[s.release.day]})` : ''}</span>`);
      }
    } else notes.push('no weekly release');
    if (s.short) notes.push('short');
    return `<div class="info"><div class="title">${esc(s.title)}</div><div class="ep">${notes.join(' · ')}${chips(s.people)}</div></div>`;
  };
  const days = plan.map((slots, d) => {
    if (!slots.length) return '';
    const rows = slots.map((slot, k) => `
      <div class="row plan-row">
        <div class="time">${clock(start + SLOT_LENGTH * k)}<small>Slot ${k + 1}</small></div>
        <div class="plan-slot${slot.length === 2 ? ' pair' : ''}">${slot.map(i => showInfo(i, d)).join('<div class="plan-or">‖</div>')}</div>
      </div>`).join('');
    return `<section class="day"><h2>${PLAN_DAYS[d]} <span class="plan-span">${clock(start)}–${clock(start + SLOT_LENGTH * slots.length)}</span></h2>${rows}</section>`;
  }).join('');
  const breakList = data.people.map((p, b) => ({ p, list: result.personBreaks[b] })).filter(x => x.list.length);
  const breaks = `<section class="day"><h2>Breaks</h2><div class="plan-breaks">${breakList.length
    ? breakList.map(({ p, list }) => `<span class="plan-break"><span class="who"><span style="${personStyle(p)}">${esc(p)}</span></span>
        ${list.map(x => `${PLAN_DAYS_SHORT[x.day]}${x.gaps > 1 ? ` ×${x.gaps}` : ''}`).join(', ')}</span>`).join('')
    : '<span class="ep">Nobody has a break.</span>'}</div></section>`;
  const actions = `<div class="plan-actions"><button id="planAgain" class="pill">Try another</button><button id="planCopy" class="pill">Copy as table</button></div>`;
  $('planOut').innerHTML = problems + stats + actions + days + breaks;
  const times = [...document.querySelectorAll('#planOut .time')];
  document.body.style.setProperty('--time-width', Math.max(0, ...times.map(t => t.scrollWidth)) + 'px');
  $('planAgain').onclick = () => generatePlan(data);
  $('planCopy').onclick = () => copyPlan(data, plan, start);
}

// Tab-separated, to paste anywhere (e.g. next to the Guckplan): title, Tag, Uhrzeit, Slot and the
// show it runs side by side with.
async function copyPlan(data, plan, start) {
  const lines = [['Anime Titel', 'Tag', 'Uhrzeit', 'Slot', 'Parallel mit'].join('\t')];
  plan.forEach((slots, d) => slots.forEach((slot, k) => slot.forEach(i => {
    const other = slot.find(j => j !== i);
    lines.push([data.shows[i].sheetTitle, SHEET_DAYS[d], clock(start + SLOT_LENGTH * k), k + 1,
      other === undefined ? '' : data.shows[other].sheetTitle].join('\t'));
  })));
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    notice('Plan copied as a table');
  } catch {
    notice("Couldn't copy (the browser didn't allow it)");
  }
}

loadPlanner();
