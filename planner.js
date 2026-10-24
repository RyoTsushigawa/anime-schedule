// ---------- Watch plan generator ----------
// Suggests a weekly watch plan for a Guckplan tab: the day, slot and time for each show, and which
// shows run side by side (groups with nobody in common watching different shows in the same slot,
// like a show's name written in someone's column), next to the plan in the Guckplan now. It only
// shows the suggestion and copies it as a table; nothing is written to the sheet.
//
// The group's rules: every day from 19:00 (or each day's own start) in 30-minute slots. A show is
// planned for everyone with Ja / Vielleicht / Wenn Belly dabei ist / a group name like "Demons" (as
// picks() reads the sheet). Shows stay on their release day where possible, never before they're
// out. People can't make some days or times (Belly: never Mondays; Rei's training, … from the
// "Seasonpläne" tab); a time blocked for everyone is skipped and the evening goes on after it.
// Best plan = fewest breaks for every person (slots between their first and last show of an evening
// where they watch nothing), then the fewest shows moved off their release day, then short evenings.
// Its own page (planner.html), opened in a new tab from the schedule's ⚙ menu; uses common.js.

const PLAN_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const PLAN_DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SHEET_DAYS = ['Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.', 'So.'];
const SLOT_LENGTH = 30;
const MAX_SLOTS = 24;
// How much each thing counts against a plan. "hard" = not allowed (someone is busy, or the episode
// isn't out yet at that slot); a break costs more the more one person has in an evening; every slot
// from 23:00 on costs extra so evenings stay short-ish.
const PLAN_COST = { hard: 1000, gap: 30, gapSquared: 6, delay: 12, keep: 2, slot: 4, late: 10 };
// On top of "delay": each show moved off its release day, by the "Other days" setting. "rarely"
// is worth about three breaks, so a show only moves when that saves several; "never" makes it as
// bad as a clash.
const MOVE_COST = { ok: 0, rarely: 100, never: PLAN_COST.hard };
// How much a person's breaks count, by their "Breaks" setting: protected people get breaks only
// when nothing else works, "fine" people take them first.
const BREAK_WEIGHT = { protect: 3, normal: 1, fine: 0.25 };
const BREAK_LABEL = { protect: '★ avoid', normal: '', fine: 'ok' };
const LATE_FROM = 23 * 60;
const MAX_SIDE_BY_SIDE = 3;
const EVERYONE = '*'; // stands for the whole group in the settings below

// Settings, kept in this browser: whole days someone can't (person → weekdays, 0 = Monday), the
// standard start and each weekday's own one ('' = standard), and busy times (person or everyone,
// day, from, to). Busy times start out filled from the sheet's "Seasonpläne" tab. How much to
// avoid moving shows off their release day (ok | rarely | never), and fixed shows: a show (by its
// sheet title) kept on its release day or a given day (0 = Monday), and maybe in a given slot.
let planUnavailable = { Belly: [0] };
let planStarts = { standard: '19:00', days: ['', '', '', '', '', '', ''] };
let planBusy = null;
let planMoves = 'rarely';
let planFixed = []; // [{ show, day: 'release' | 0–6, slot: '' | 1, 2, … | 'none' }]
let planBreaks = {}; // person → 'protect' | 'fine' (missing = normal)
try {
  planUnavailable = JSON.parse(localStorage.getItem('planUnavailable')) || planUnavailable;
  planStarts = JSON.parse(localStorage.getItem('planStarts')) || { ...planStarts, standard: localStorage.getItem('planStart') || '19:00' };
  planBusy = JSON.parse(localStorage.getItem('planBusy'));
  planMoves = MOVE_COST[localStorage.getItem('planMoves')] !== undefined ? localStorage.getItem('planMoves') : planMoves;
  planFixed = JSON.parse(localStorage.getItem('planFixed')) || [];
  planBreaks = JSON.parse(localStorage.getItem('planBreaks')) || {};
} catch {}
const saveSettings = () => {
  try {
    localStorage.setItem('planUnavailable', JSON.stringify(planUnavailable));
    localStorage.setItem('planStarts', JSON.stringify(planStarts));
    localStorage.setItem('planBusy', JSON.stringify(planBusy || []));
    localStorage.setItem('planMoves', planMoves);
    localStorage.setItem('planFixed', JSON.stringify(planFixed));
    localStorage.setItem('planBreaks', JSON.stringify(planBreaks));
  } catch {}
};
let planTabGid = null;
const planCache = new Map(); // tab gid → planner data
let planOutcome = null;
let planView = 'compare'; // compare | suggestion | now
try { planView = localStorage.getItem('planView') || planView; } catch {}
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

// The Guckplan tabs, then the season lists ("Winter 2027"), which can be planned from their votes
// before the season's Guckplan exists. Newest first in each.
async function seasonListTabs() {
  const html = await (await fetch(SHEET + '/htmlview')).text();
  return [...html.matchAll(/\{name: "([^"]+)", pageUrl: "[^"]*gid=(\d+)/g)]
    .map(([, name, gid]) => ({ name: JSON.parse(`"${name}"`).trim(), gid }))
    .map(t => ({ ...t, season: t.name.match(/^(Winter|Frühling|Sommer|Herbst)\s+(\d{4})$/i) }))
    .filter(t => t.season)
    .map(({ name, gid, season }) => ({ name, gid, list: true, start: new Date(Number(season[2]), SEASON_MONTH[season[1].toLowerCase()], 1).getTime() }))
    .sort((a, b) => b.start - a.start);
}
const ready = Promise.all([
  fetch('streams-de.json', { cache: 'no-cache' }).then(r => r.json()).then(json => { streamsDe = json; }, () => {}),
  Promise.all([guckplanTabs(), seasonListTabs().catch(() => [])])
    .then(([guckplans, lists]) => { tabs = [...guckplans, ...lists]; }, e => console.warn('Sheet tabs not loaded:', e)),
]);

const minutesOf = time => {
  const hm = parseTime(time);
  return hm ? (hm[0] < NIGHT_UNTIL ? hm[0] + 24 : hm[0]) * 60 + hm[1] : null;
};
const clock = min => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const dayIndex = tag => WEEKDAYS.indexOf(norm(tag).slice(0, 2));
const bits = mask => { let n = 0; for (; mask; mask &= mask - 1) n++; return n; };

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
      row: e.show, // its sheet row, for the export
      mal: m?.idMal ? `https://myanimelist.net/anime/${m.idMal}` : '',
      people: e.people,
      mask: e.people.reduce((mask, p) => mask | (1 << people.indexOf(p)), 0),
      release,
      short: !!m?.duration && m.duration <= 15,
      // Where the Guckplan has it now: the day, the time, and the slot number (rows without a
      // time yet are placed by their slot).
      current: day >= 0 ? { day, min: minutesOf(e.slot.time), slot: Number(e.slot.slot) || null } : null,
    };
  });
  const data = { tab, people, shows, sheet };
  planCache.set(tab.gid, data);
  return data;
}

// Each show's AniList entry (episode length, next episode): by id where the weekly LiveChart data
// knows the show, else by searching its title among airing and upcoming shows.
async function plannerMedia(shows) {
  const fields = 'id idMal duration title { romaji english } nextAiringEpisode { airingAt }';
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

// Busy times from the sheet's "Seasonpläne" tab (read-only): blocks headed by a name ("Rei",
// "Terra & Blau"), weekday columns from "Montag", times on the left. A block that's mostly anime is
// someone's watch plan and is skipped; anything else (Training, BG3-Truppe, …) counts as busy.
async function seasonplanBusy(data) {
  const html = await (await fetch(SHEET + '/htmlview')).text();
  const gid = html.match(/\{name: "Seasonpl(?:ä|\\u00e4)ne", pageUrl: "[^"]*gid=(\d+)/)?.[1];
  if (!gid) return [];
  const res = await fetch(`${SHEET}/export?format=csv&gid=${gid}`);
  if (!res.ok) return [];
  const v = parseCsv(await res.text()).map(r => r.map(c => c.trim()));
  const titles = data.shows.flatMap(s => [norm(s.title), norm(s.sheetTitle)]).filter(Boolean);
  const blockPeople = name => name.split(/\s*(?:&|,|\+|\bund\b)\s*/i).map(n => norm(n) === 'blau' ? 'blue' : norm(n))
    .flatMap(n => data.people.filter(p => n && norm(p) === n));
  const ranges = [];
  for (let r = 0; r < v.length; r++)
    for (let c = 1; c < v[r].length; c++) {
      if (norm(v[r][c]) !== 'montag') continue;
      let name = '';
      for (let up = r - 1; up >= 0 && !name; up--) name = v[up][c - 1] || v[up][c] || '';
      const who = blockPeople(name);
      if (!who.length) continue;
      const entries = [];
      for (let x = r + 1; x < v.length; x++) {
        const time = minutesOf(v[x][c - 1]);
        if (time === null) continue;
        for (let d = 0; d < 7; d++) if (v[x][c + d]) entries.push({ d, time, text: v[x][c + d] });
      }
      const anime = e => e.text.split(/[^A-Za-zÄÖÜäöüß0-9]+/).some(w => w.length >= 4 && titles.some(t => t.includes(norm(w))));
      if (!entries.length || entries.filter(anime).length / entries.length >= 0.3) continue;
      entries.sort((a, b) => a.d - b.d || a.time - b.time);
      for (const e of entries) {
        const last = ranges[ranges.length - 1];
        if (last && last.c === c && last.d === e.d && last.note === e.text && last.to === e.time) last.to = e.time + SLOT_LENGTH;
        else ranges.push({ c, who, d: e.d, from: e.time, to: e.time + SLOT_LENGTH, note: e.text });
      }
    }
  return ranges.flatMap(r => r.who.map(person => ({ person, day: r.d, from: clock(r.from), to: clock(r.to), note: r.note })));
}

// ---------- The plan and what it costs ----------
// A plan: seven days (Monday first), each an array of slots in order; a slot holds one show, or up
// to three shows watched side by side by groups with nobody in common. Shows are indexes into
// data.shows. Each day's slot times leave out times blocked for everyone.

function planContext(data) {
  const everyone = data.people.reduce((mask, p, b) => mask | (1 << b), 0);
  const maskOf = person => person === EVERYONE ? everyone : data.people.includes(person) ? 1 << data.people.indexOf(person) : 0;
  const standard = minutesOf(planStarts.standard) ?? 19 * 60;
  const starts = PLAN_DAYS.map((day, d) => minutesOf(planStarts.days[d]) ?? standard);
  const busy = (planBusy || []).map(e => ({ mask: maskOf(e.person), all: e.person === EVERYONE, day: Number(e.day), from: minutesOf(e.from), to: minutesOf(e.to) }))
    .filter(e => e.mask);
  const overlaps = (e, at) => e.from === null || e.to === null || (at < e.to && at + SLOT_LENGTH > e.from);
  // Times blocked for everyone (with from/to) aren't slots at all; the evening continues after them.
  const times = starts.map((start, d) => {
    const list = [];
    for (let at = start; list.length < MAX_SLOTS; at += SLOT_LENGTH)
      if (!busy.some(e => e.all && e.day === d && e.from !== null && e.to !== null && overlaps(e, at))) list.push(at);
    return list;
  });
  // Who's busy in each slot: whole days off (per person or everyone) and busy times.
  const busyMask = times.map((list, d) => list.map(at => {
    let mask = 0;
    for (const [person, days] of Object.entries(planUnavailable)) if (days.includes(d)) mask |= maskOf(person);
    for (const e of busy) if (e.day === d && overlaps(e, at)) mask |= e.mask;
    return mask;
  }));
  // Fixed shows, per show: { day (null = any), slot (0-based, null = any), dayOnly }, or null.
  // "Day only" (slot 'none', for late-night shows): on that day but in no slot, so it's left out
  // of the plan itself (no breaks, no evening length).
  const fixed = data.shows.map(s => {
    const f = planFixed.find(f => f.show === s.sheetTitle);
    // A Guckplan row with a day but no time and no slot is already day-only there.
    if (!f) return s.current && s.current.min === null && !s.current.slot ? { day: s.current.day, slot: null, dayOnly: true } : null;
    const day = f.day === 'release' ? s.release?.day ?? s.current?.day ?? null : Number(f.day);
    const slot = Number(f.slot) > 0 ? Number(f.slot) - 1 : null;
    if (f.slot === 'none' && day !== null) return { day, slot: null, dayOnly: true };
    return day === null && slot === null ? null : { day, slot };
  });
  // The shows the plan places in slots, and the day-only ones per day.
  const active = data.shows.map((s, i) => i).filter(i => !fixed[i]?.dayOnly);
  const dayOnly = PLAN_DAYS.map((day, d) => data.shows.map((s, i) => i).filter(i => fixed[i]?.dayOnly && fixed[i].day === d));
  const breakWeight = data.people.map(p => BREAK_WEIGHT[planBreaks[p]] ?? 1);
  return { shows: data.shows, people: data.people, times, busy: busyMask, fixed, active, dayOnly, breakWeight, moveCost: MOVE_COST[planMoves] };
}

// The cost, and with `details` everything the result page shows.
function planCost(plan, ctx, details = false) {
  const { shows, times, people, busy, fixed, moveCost, breakWeight } = ctx;
  let cost = 0, breaks = 0, moved = 0;
  const personBreaks = details ? people.map(() => []) : null;
  const problems = details ? [] : null;
  for (let d = 0; d < 7; d++) {
    const slots = plan[d];
    const at = k => times[d][Math.min(k, MAX_SLOTS - 1)] + SLOT_LENGTH * Math.max(0, k - MAX_SLOTS + 1);
    cost += PLAN_COST.slot * slots.length;
    const masks = slots.map(slot => slot.reduce((mask, i) => mask | shows[i].mask, 0));
    for (let k = 0; k < slots.length; k++) {
      if (at(k) >= LATE_FROM) cost += PLAN_COST.late;
      for (const i of slots[k]) {
        const s = shows[i];
        const clash = s.mask & busy[d][Math.min(k, MAX_SLOTS - 1)];
        if (clash) {
          cost += PLAN_COST.hard;
          if (details) problems.push(`${s.title}: ${people.filter((p, b) => clash & (1 << b)).join(', ')} can't on ${PLAN_DAYS_SHORT[d]} ${clock(at(k))}`);
        }
        if (s.release) {
          const delay = (d - s.release.day + 7) % 7;
          if (delay === 0 && at(k) < s.release.min) {
            cost += PLAN_COST.hard;
            if (details) problems.push(`${s.title}: only out at ${clock(s.release.min)}`);
          }
          if (delay) { cost += PLAN_COST.delay * delay + moveCost; moved++; }
        }
        if (s.current && s.current.day !== d) cost += PLAN_COST.keep;
        const f = fixed[i];
        if (f && f.day !== null && f.day !== d) {
          cost += PLAN_COST.hard;
          if (details) problems.push(`${s.title}: fixed to ${PLAN_DAYS_SHORT[f.day]}`);
        }
        if (f && f.slot !== null && f.slot !== k) {
          cost += PLAN_COST.hard;
          if (details) problems.push(`${s.title}: fixed to slot ${f.slot + 1}`);
        }
      }
    }
    for (let p = 0; p < people.length; p++) {
      const bit = 1 << p;
      let first = -1, last = -1, count = 0;
      for (let k = 0; k < masks.length; k++)
        if (masks[k] & bit) { if (first < 0) first = k; last = k; count++; }
      const gaps = first < 0 ? 0 : last - first + 1 - count;
      if (!gaps) continue;
      cost += (PLAN_COST.gap * gaps + PLAN_COST.gapSquared * gaps * gaps) * breakWeight[p];
      breaks += gaps;
      if (details) personBreaks[p].push({ day: d, gaps });
    }
  }
  return details ? { cost, breaks, moved, personBreaks, problems } : cost;
}

// Start: every show on its release day (or the next day its people can), in release order.
function startPlan(ctx, shuffle) {
  const plan = [[], [], [], [], [], [], []];
  const order = ctx.active.slice();
  if (shuffle) order.sort(() => Math.random() - 0.5);
  for (const i of order) {
    const s = ctx.shows[i];
    let d = s.release ? s.release.day : s.current ? s.current.day : Math.floor(Math.random() * 7);
    for (let t = 0; t < 7 && (s.mask & ctx.busy[d][0]); t++) d = (d + 1) % 7;
    if (ctx.fixed[i]?.day != null) d = ctx.fixed[i].day;
    plan[d].push([i]);
  }
  for (const day of plan) day.sort((a, b) => (ctx.shows[a[0]].release?.min ?? 0) - (ctx.shows[b[0]].release?.min ?? 0));
  // Shows fixed to a slot go there right away (lowest slot first).
  for (const day of plan) {
    const pinned = day.filter(([i]) => ctx.fixed[i]?.slot != null).sort((a, b) => ctx.fixed[a[0]].slot - ctx.fixed[b[0]].slot);
    for (const slot of pinned) {
      day.splice(day.indexOf(slot), 1);
      day.splice(Math.min(ctx.fixed[slot[0]].slot, day.length), 0, slot);
    }
  }
  return plan;
}

// One random change: move a show (to another slot or day, alone or next to other shows), swap two
// slots of an evening, or swap two shows. Null when the change isn't possible.
function changePlan(plan, ctx) {
  const { shows, active } = ctx;
  if (!active.length) return null;
  const next = plan.map(day => day.map(slot => slot.slice()));
  const pickShow = () => active[Math.floor(Math.random() * active.length)];
  const where = i => {
    for (let d = 0; d < 7; d++)
      for (let k = 0; k < next[d].length; k++)
        if (next[d][k].includes(i)) return [d, k];
  };
  // Shows side by side: nobody may be in two of them.
  const slotMask = slot => slot.reduce((mask, i) => mask | shows[i].mask, 0);
  const apart = slot => slot.reduce((sum, i) => sum + bits(shows[i].mask), 0) === bits(slotMask(slot));
  const fits = (slot, i) => slot.length < MAX_SIDE_BY_SIDE && !(slotMask(slot) & shows[i].mask);
  const r = Math.random();
  if (r < 0.6) {
    const i = pickShow();
    const [d, k] = where(i);
    next[d][k].splice(next[d][k].indexOf(i), 1);
    if (!next[d][k].length) next[d].splice(k, 1);
    const s = shows[i];
    const pick = Math.random();
    const to = ctx.fixed[i]?.day != null ? ctx.fixed[i].day
      : pick < 0.5 ? d : pick < 0.8 && s.release ? (s.release.day + Math.floor(Math.random() * 2)) % 7 : Math.floor(Math.random() * 7);
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
    const a = pickShow(), b = pickShow();
    const [da, ka] = where(a), [db, kb] = where(b);
    if (da === db && ka === kb) return null;
    const sa = next[da][ka], sb = next[db][kb];
    sa[sa.indexOf(a)] = b;
    sb[sb.indexOf(b)] = a;
    if (!apart(sa) || !apart(sb)) return null;
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

// The plan in the Guckplan now (Tag + Uhrzeit): each evening as its times, shows at the same time
// side by side. A row with a day and a slot but no time yet gets that slot's time (the day's start
// plus 30 minutes per slot); a row with only a day is day-only (dayOnly, in no slot). For the cost,
// every 30 minutes from the evening's first show is one slot.
function currentPlan(ctx) {
  const timeOf = s => !s.current ? null
    : s.current.min ?? (s.current.slot ? ctx.times[s.current.day][s.current.slot - 1] ?? null : null);
  const days = PLAN_DAYS.map((day, d) => {
    const today = ctx.shows.map((s, i) => ({ i, at: s.current?.day === d ? timeOf(s) : null })).filter(x => x.at !== null);
    const times = [...new Set(today.map(x => x.at))].sort((a, b) => a - b);
    return times.map(at => ({ at, shows: today.filter(x => x.at === at).map(x => x.i) }));
  });
  const dayOnly = PLAN_DAYS.map((day, d) => ctx.shows.map((s, i) => i).filter(i => ctx.shows[i].current?.day === d && timeOf(ctx.shows[i]) === null));
  const plan = days.map(evening => {
    const slots = [];
    if (!evening.length) return slots;
    for (const { at, shows } of evening) {
      const k = Math.round((at - evening[0].at) / SLOT_LENGTH);
      while (slots.length <= k) slots.push([]);
      slots[k].push(...shows);
    }
    return slots;
  });
  const unplaced = ctx.shows.map((s, i) => i).filter(i => !ctx.shows[i].current);
  return { days, plan, unplaced, dayOnly };
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
  // Busy times: filled from "Seasonpläne" the first time (Belly's Mondays are a whole-day block).
  if (!planBusy) {
    try { planBusy = await seasonplanBusy(data); } catch { planBusy = []; }
    saveSettings();
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
    `<option value="${esc(t.gid)}"${t.gid === data.tab.gid ? ' selected' : ''}>${esc(t.name)}${t.list ? ' (votes)' : ''}</option>`).join('');
  // Days across the top, each day's own start time, then whole days off: "Everyone" first.
  const header = `<span></span>${PLAN_DAYS_SHORT.map(day => `<span class="avail-head">${day}</span>`).join('')}`;
  const starts = `<span class="avail-name everyone">Start</span>${PLAN_DAYS.map((day, d) =>
    `<input class="avail-start" data-day="${d}" value="${esc(planStarts.days[d] || '')}" placeholder="${esc(planStarts.standard)}"
      inputmode="numeric" maxlength="5" aria-label="Start on ${day}" title="Start on ${day} (empty = standard)">`).join('')}`;
  const grid = [EVERYONE, ...data.people].map(p => `
    <span class="avail-name${p === EVERYONE ? ' everyone' : ''}" style="${p === EVERYONE ? '' : personStyle(p)}">${p === EVERYONE ? 'Everyone' : esc(p)}</span>${PLAN_DAYS_SHORT.map((day, d) =>
      `<button class="avail-day" data-person="${esc(p)}" data-day="${d}" aria-pressed="${(planUnavailable[p] || []).includes(d)}"
        title="${p === EVERYONE ? 'Nobody watches' : esc(p) + " can't"} on ${PLAN_DAYS[d]}">${day.slice(0, 2)}</button>`).join('')}`).join('');
  return `<section class="plan-card">
    <div class="plan-head">
      <select id="planTab" class="pill" aria-label="Guckplan tab">${tabOptions}</select>
      <label class="plan-start">Start <input id="planStandard" class="pill" value="${esc(planStarts.standard)}" inputmode="numeric" maxlength="5" aria-label="Standard start"></label>
      <button id="planRun" class="pill plan-go">Generate plan</button>
    </div>
    <div class="menu-label">Who can't when <span class="plan-hint">· tap a day for the whole day off</span></div>
    <div class="avail">${header}${starts}${grid}</div>
    <div class="menu-label">Busy times <span class="plan-hint">· “Everyone” skips that time for all</span></div>
    <div id="busyList" class="busy-list">${busyRows(data)}</div>
    <div class="plan-actions busy-actions">
      <button id="busyAdd" class="pill">+ Add</button>
      <button id="busyReload" class="pill" title="Replace the busy times with the ones in the Seasonpläne tab">↻ From Seasonpläne</button>
    </div>
    <div class="menu-label">Other days <span class="plan-hint">· moving a show off its release day</span></div>
    <div class="segmented plan-moves" role="group" aria-label="Moving shows to other days">${[['ok', 'When it helps'], ['rarely', 'Rarely'], ['never', 'Never']].map(([v, label]) =>
      `<button data-moves="${v}" aria-pressed="${planMoves === v}">${label}</button>`).join('')}</div>
    <div class="menu-label">Breaks <span class="plan-hint">· tap a name: ★ avoid their breaks most, “ok” = they mind least</span></div>
    <div class="plan-break-prefs">${data.people.map(p => breakChip(p)).join('')}</div>
    <div class="menu-label">Fixed shows <span class="plan-hint">· kept on a day, in a slot, or day only (late night)</span></div>
    <div id="fixedList" class="busy-list">${fixedRows(data)}</div>
    <div class="plan-actions busy-actions"><button id="fixedAdd" class="pill">+ Add</button></div>
  </section>`;
}

const breakChip = p => {
  const pref = planBreaks[p] || 'normal';
  return `<button class="break-pref ${pref}" data-break-person="${esc(p)}" style="${personStyle(p)}"
    title="${esc(p)}'s breaks: ${pref === 'protect' ? 'avoid most' : pref === 'fine' ? 'they mind least' : 'normal'}">${esc(p)}${BREAK_LABEL[pref] ? ` <small>${BREAK_LABEL[pref]}</small>` : ''}</button>`;
};

const selectOptions = (list, value) => list.map(([v, label]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(label)}</option>`).join('');

function fixedRows(data) {
  if (!planFixed.length) return '<div class="ep busy-empty">None.</div>';
  const shows = data.shows.map(s => [s.sheetTitle, s.title]).sort((a, b) => a[1].localeCompare(b[1]));
  const days = [['release', 'Release day'], ...PLAN_DAYS_SHORT.map((d, j) => [j, d])];
  const slots = [['', 'Any slot'], ...Array.from({ length: 10 }, (_, k) => [k + 1, `Slot ${k + 1}`]), ['none', 'Day only (no slot)']];
  return planFixed.map((f, i) => `
    <div class="busy-row" data-i="${i}">
      <select class="pill fixed-show" data-field="show" aria-label="Show">${selectOptions(shows, f.show)}</select>
      <select class="pill" data-field="day" aria-label="Day">${selectOptions(days, f.day)}</select>
      <select class="pill" data-field="slot" aria-label="Slot">${selectOptions(slots, f.slot)}</select>
      <button class="round busy-remove" aria-label="Remove">✕</button>
    </div>`).join('');
}

function busyRows(data) {
  if (!planBusy?.length) return '<div class="ep busy-empty">None.</div>';
  const options = selectOptions;
  const who = [[EVERYONE, 'Everyone'], ...data.people.map(p => [p, p])];
  return planBusy.map((e, i) => `
    <div class="busy-row" data-i="${i}">
      <select class="pill" data-field="person" aria-label="Who">${options(who, e.person)}</select>
      <select class="pill" data-field="day" aria-label="Day">${options(PLAN_DAYS_SHORT.map((d, j) => [j, d]), e.day)}</select>
      <input class="pill busy-time" data-field="from" value="${esc(e.from || '')}" placeholder="from" inputmode="numeric" maxlength="5" aria-label="From">
      <input class="pill busy-time" data-field="to" value="${esc(e.to || '')}" placeholder="to" inputmode="numeric" maxlength="5" aria-label="To">
      <input class="pill busy-note" data-field="note" value="${esc(e.note || '')}" placeholder="note" aria-label="Note">
      <button class="round busy-remove" aria-label="Remove">✕</button>
    </div>`).join('');
}

function bindPlannerSetup(data) {
  $('planTab').onchange = () => { planTabGid = $('planTab').value; planOutcome = null; loadPlanner(); };
  $('planStandard').onchange = () => {
    planStarts.standard = minutesOf($('planStandard').value) !== null ? $('planStandard').value : '19:00';
    for (const input of document.querySelectorAll('.avail-start')) input.placeholder = planStarts.standard;
    saveSettings();
  };
  for (const input of document.querySelectorAll('.avail-start'))
    input.onchange = () => {
      planStarts.days[Number(input.dataset.day)] = minutesOf(input.value) !== null ? input.value : '';
      input.value = planStarts.days[Number(input.dataset.day)];
      saveSettings();
    };
  for (const b of document.querySelectorAll('.avail-day'))
    b.onclick = () => {
      const days = new Set(planUnavailable[b.dataset.person] || []);
      const d = Number(b.dataset.day);
      days.has(d) ? days.delete(d) : days.add(d);
      planUnavailable[b.dataset.person] = [...days].sort();
      b.setAttribute('aria-pressed', days.has(d));
      saveSettings();
    };
  const redrawBusy = () => { $('busyList').innerHTML = busyRows(data); bindBusy(); };
  const bindBusy = () => {
    for (const row of document.querySelectorAll('#busyList .busy-row')) {
      const e = planBusy[Number(row.dataset.i)];
      for (const field of row.querySelectorAll('[data-field]'))
        field.onchange = () => { e[field.dataset.field] = field.dataset.field === 'day' ? Number(field.value) : field.value; saveSettings(); };
      row.querySelector('.busy-remove').onclick = () => { planBusy.splice(Number(row.dataset.i), 1); saveSettings(); redrawBusy(); };
    }
  };
  bindBusy();
  $('busyAdd').onclick = () => { planBusy.push({ person: EVERYONE, day: 0, from: '', to: '', note: '' }); saveSettings(); redrawBusy(); };
  $('busyReload').onclick = async () => {
    try { planBusy = await seasonplanBusy(data); } catch { notice("Couldn't read Seasonpläne"); return; }
    saveSettings();
    redrawBusy();
    notice('Busy times taken from Seasonpläne');
  };
  for (const b of document.querySelectorAll('[data-moves]'))
    b.onclick = () => {
      planMoves = b.dataset.moves;
      for (const o of document.querySelectorAll('[data-moves]')) o.setAttribute('aria-pressed', o === b);
      saveSettings();
    };
  const NEXT_PREF = { normal: 'protect', protect: 'fine', fine: 'normal' };
  for (const b of document.querySelectorAll('[data-break-person]'))
    b.onclick = () => {
      const p = b.dataset.breakPerson;
      const pref = NEXT_PREF[planBreaks[p] || 'normal'];
      if (pref === 'normal') delete planBreaks[p]; else planBreaks[p] = pref;
      saveSettings();
      b.outerHTML = breakChip(p);
      bindPlannerSetup(data);
    };
  const redrawFixed = () => { $('fixedList').innerHTML = fixedRows(data); bindFixed(); };
  const bindFixed = () => {
    for (const row of document.querySelectorAll('#fixedList .busy-row')) {
      const f = planFixed[Number(row.dataset.i)];
      for (const field of row.querySelectorAll('[data-field]'))
        field.onchange = () => {
          const v = field.value;
          f[field.dataset.field] = field.dataset.field === 'show' || v === 'release' || v === 'none' || v === '' ? v : Number(v);
          saveSettings();
        };
      row.querySelector('.busy-remove').onclick = () => { planFixed.splice(Number(row.dataset.i), 1); saveSettings(); redrawFixed(); };
    }
  };
  bindFixed();
  $('fixedAdd').onclick = () => {
    const free = data.shows.find(s => !planFixed.some(f => f.show === s.sheetTitle));
    if (!free) return;
    planFixed.push({ show: free.sheetTitle, day: 'release', slot: '' });
    saveSettings();
    redrawFixed();
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
  const { shows, times } = ctx;
  const result = planCost(plan, ctx, true);
  const now = currentPlan(ctx);
  const nowResult = planCost(now.plan, ctx, true);
  const endOf = days => Math.max(0, ...days.filter(Boolean));
  const ends = plan.map((slots, d) => slots.length ? times[d][slots.length - 1] + SLOT_LENGTH : 0);
  const nowEnds = now.days.map(evening => evening.length ? evening[evening.length - 1].at + SLOT_LENGTH : 0);
  const sideBySide = p => p.flat().filter(slot => slot.length > 1).length;
  const nowMoved = shows.filter(s => s.release && s.current && s.current.day !== s.release.day).length;
  const tile = (value, label, was) => `<div class="plan-tile"><b>${value}</b><span>${label}</span><small>Guckplan now: ${was}</small></div>`;
  const stats = `<div class="plan-stats">
    ${tile(result.breaks, result.breaks === 1 ? 'break' : 'breaks', nowResult.breaks)}
    ${tile(result.moved, 'moved off release day', nowMoved)}
    ${tile(sideBySide(plan), 'slots side by side', sideBySide(now.plan))}
    ${tile(clock(endOf(ends)), 'latest end', nowEnds.some(Boolean) ? clock(endOf(nowEnds)) : '–')}
  </div>`;
  const problems = result.problems.length ? `<details class="warning" open><summary>${result.problems.length} ${result.problems.length === 1 ? "show doesn't" : "shows don't"} fit anywhere cleanly</summary>
    <ul>${result.problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul></details>` : '';
  const chips = people => `<span class="who">${people.map(p => `<span style="${personStyle(p)}">${esc(p)}</span>`).join('')}</span>`;
  const showInfo = (i, d) => {
    const s = shows[i];
    const notes = [];
    if (s.release) {
      notes.push(`out ${PLAN_DAYS_SHORT[s.release.day]} ${clock(s.release.min)}`);
      const delay = d < 0 ? 0 : (d - s.release.day + 7) % 7;
      if (delay) notes.push(`<span class="plan-moved">+${delay} ${delay === 1 ? 'day' : 'days'}</span>`);
    } else notes.push('no weekly release');
    if (s.short) notes.push('short');
    if (ctx.fixed[i]?.dayOnly) notes.push('day only');
    else if (ctx.fixed[i]) notes.push('📌 fixed');
    return `<div class="info"><div class="title">${esc(s.title)}</div><div class="ep">${notes.join(' · ')}${chips(s.people)}</div></div>`;
  };
  const row = (at, label, slot, d) => `
    <div class="row plan-row">
      <div class="time">${clock(at)}${label ? `<small>${label}</small>` : ''}</div>
      <div class="plan-slot${slot.length > 1 ? ' pair' : ''}">${slot.map(i => showInfo(i, d)).join('<div class="plan-or">‖</div>')}</div>
    </div>`;
  // Day-only shows (late night): after the evening, without a time.
  const dayOnlyRows = (list, d) => list.map(i => `
    <div class="row plan-row">
      <div class="time">–<small>no slot</small></div>
      <div class="plan-slot">${showInfo(i, d)}</div>
    </div>`).join('');
  const suggestionDay = d => plan[d].map((slot, k) => row(times[d][k], `Slot ${k + 1}`, slot, d)).join('') + dayOnlyRows(ctx.dayOnly[d], d);
  const nowDay = d => now.days[d].map(({ at, shows: slot }) => row(at, '', slot, d)).join('') + dayOnlyRows(now.dayOnly[d], d);
  const span = (from, to) => from === null ? '' : `<span class="plan-span">${clock(from)}–${clock(to)}</span>`;
  const days = PLAN_DAYS.map((day, d) => {
    const mine = plan[d].length ? span(times[d][0], ends[d]) : '';
    const theirs = now.days[d].length ? span(now.days[d][0].at, nowEnds[d]) : '';
    const hasMine = plan[d].length || ctx.dayOnly[d].length, hasTheirs = now.days[d].length || now.dayOnly[d].length;
    if (planView === 'suggestion') return hasMine ? `<section class="day"><h2>${day} ${mine}</h2>${suggestionDay(d)}</section>` : '';
    if (planView === 'now') return hasTheirs ? `<section class="day"><h2>${day} ${theirs}</h2>${nowDay(d)}</section>` : '';
    if (!hasMine && !hasTheirs) return '';
    return `<section class="day"><h2>${day}</h2><div class="plan-compare">
      <div><div class="plan-side">Guckplan now ${theirs}</div>${nowDay(d) || '<div class="ep plan-none">Nothing</div>'}</div>
      <div><div class="plan-side">Suggestion ${mine}</div>${suggestionDay(d) || '<div class="ep plan-none">Nothing</div>'}</div>
    </div></section>`;
  }).join('');
  const unplaced = planView !== 'suggestion' && now.unplaced.length
    ? `<section class="day"><h2>No day in the Guckplan yet</h2>${now.unplaced.map(i => `<div class="row plan-row"><div class="time">–</div><div class="plan-slot">${showInfo(i, -1)}</div></div>`).join('')}</section>` : '';
  const breakList = (r, label) => {
    const list = data.people.map((p, b) => ({ p, list: r.personBreaks[b] })).filter(x => x.list.length);
    return `<div class="plan-breaks"><span class="plan-side">${label}</span>${list.length
      ? list.map(({ p, list }) => `<span class="plan-break"><span class="who"><span style="${personStyle(p)}">${esc(p)}</span></span>
          ${list.map(x => `${PLAN_DAYS_SHORT[x.day]}${x.gaps > 1 ? ` ×${x.gaps}` : ''}`).join(', ')}</span>`).join('')
      : '<span class="ep">nobody</span>'}</div>`;
  };
  const breaks = `<section class="day"><h2>Breaks</h2>${breakList(result, 'Suggestion')}${breakList(nowResult, 'Guckplan now')}</section>`;
  const views = [['compare', 'Side by side'], ['suggestion', 'Suggestion'], ['now', 'Guckplan now']];
  const actions = `<div class="plan-actions">
    <div class="segmented plan-views" role="group" aria-label="Show">${views.map(([v, label]) =>
      `<button data-plan-view="${v}" aria-pressed="${planView === v}">${label}</button>`).join('')}</div>
    <button id="planAgain" class="pill">Try another</button><button id="planCopy" class="pill">Copy as table</button>
    <button id="planSheet" class="pill" title="A code for the Season-Helfer in the sheet: Season-Helfer → 3. Watch-Plan einfügen, then paste">Copy for Season-Helfer</button>
    <button id="planXlsx" class="pill" title="The plan as a Guckplan tab: in Google Sheets, File → Import → Insert new sheet">Download .xlsx</button></div>`;
  $('planOut').innerHTML = problems + stats + actions + days + unplaced + breaks;
  const cells = [...document.querySelectorAll('#planOut .time')];
  document.body.style.setProperty('--time-width', Math.max(0, ...cells.map(t => t.scrollWidth)) + 'px');
  $('planAgain').onclick = () => generatePlan(data);
  $('planCopy').onclick = () => copyPlan(data, plan, times);
  $('planXlsx').onclick = () => downloadXlsx(data, plan, times);
  $('planSheet').onclick = () => copyForSheet(data, plan, times);
  for (const b of document.querySelectorAll('[data-plan-view]'))
    b.onclick = () => {
      planView = b.dataset.planView;
      try { localStorage.setItem('planView', planView); } catch {}
      showPlan(data, plan);
    };
}

// Tab-separated, to paste anywhere (e.g. next to the Guckplan): title, Tag, Uhrzeit, Slot and the
// shows it runs side by side with.
async function copyPlan(data, plan, times) {
  const lines = [['Anime Titel', 'Tag', 'Uhrzeit', 'Slot', 'Parallel mit'].join('\t')];
  const { dayOnly } = planContext(data);
  plan.forEach((slots, d) => {
    slots.forEach((slot, k) => slot.forEach(i => {
      lines.push([data.shows[i].sheetTitle, SHEET_DAYS[d], clock(times[d][k]), k + 1,
        slot.filter(j => j !== i).map(j => data.shows[j].sheetTitle).join(', ')].join('\t'));
    }));
    for (const i of dayOnly[d]) lines.push([data.shows[i].sheetTitle, SHEET_DAYS[d], '', '', ''].join('\t'));
  });
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    notice('Plan copied as a table');
  } catch {
    notice("Couldn't copy (the browser didn't allow it)");
  }
}

// The plan as Guckplan rows, for the .xlsx and the Season-Helfer: Sort, Slot, Anime Titel, Eng
// Anime Titel (both linking to MyAnimeList), Startdatum, Wo, Tag, Uhrzeit, then everyone's column.
// Shows side by side are written the group's way: the show most people watch keeps its row, the
// others' watchers get that show's name in their cell there, and the others' own rows are hidden.
// Planned shows come by day and slot; the sheet's other rows (nobody watching, dropped) follow as
// they were.
function guckplanRows(data, plan, times) {
  const { sheet, shows } = data;
  // Every person column as in the sheet, the ones hidden there (people no longer taking part) hidden.
  const columns = sheet.columns || sheet.people.map(name => ({ name, hidden: false }));
  const people = columns.map(c => c.name);
  const YES = /^(ja|vielleicht)$|^wenn belly/i;
  const names = v => v && !YES.test(v) && !/^(nein|default|allein)$/i.test(v) && resolveName(sheet, v);
  // A show's own row: its watchers say yes there (as they did, else "Ja"); a show's name left from
  // an earlier pairing becomes "Nein".
  const ownVotes = s => Object.fromEntries(people.map(p => {
    const own = s.row.votes?.[p] || '';
    return [p, s.people.includes(p) ? (YES.test(own) ? own : 'Ja') : names(own) ? 'Nein' : own || 'Default'];
  }));
  const rows = [];
  const placed = new Set();
  const { dayOnly } = planContext(data);
  plan.forEach((slots, d) => {
    slots.forEach((slot, k) => {
      const [main, ...others] = slot.map(i => shows[i]).sort((a, b) => b.people.length - a.people.length);
      const when = { tag: SHEET_DAYS[d], time: clock(times[d][k]), slot: k + 1 };
      const votes = ownVotes(main);
      for (const o of others) for (const p of o.people) votes[p] = o.row.english || o.row.romaji;
      rows.push({ s: main, ...when, votes, hidden: false });
      for (const o of others) rows.push({ s: o, ...when, votes: ownVotes(o), hidden: true });
      for (const i of slot) placed.add(shows[i].row);
    });
    // Day-only shows: the day, no slot and no time.
    for (const i of dayOnly[d]) {
      rows.push({ s: shows[i], tag: SHEET_DAYS[d], time: '', slot: '', votes: ownVotes(shows[i]), hidden: false });
      placed.add(shows[i].row);
    }
  });
  for (const r of sheet.shows)
    if (!placed.has(r)) rows.push({ s: { row: r, mal: '' }, tag: r.tag, time: r.time, slot: '', votes: { ...r.votes }, hidden: r.hidden });
  const title = data.tab.list ? `Guckplan ${data.tab.name}` : data.tab.name;
  return { title, columns, people, rows };
}

// The plan as a Guckplan tab (.xlsx, for File → Import → Insert new sheet), everyone's column in
// their colour, the ones hidden in the sheet hidden.
function downloadXlsx(data, plan, times) {
  const { title, columns, people, rows } = guckplanRows(data, plan, times);
  const blob = xlsxBlob({
    name: `${title} Vorschlag`,
    widths: [2, 5, 6, 32, 32, 11, 5, 6, 8, ...columns.map(c => c.hidden ? { width: 12, hidden: true } : 12)],
    headerRow: 2,
    header: [{ text: '' }, ...['Sort', 'Slot', 'Anime Titel', 'Eng Anime Titel', 'Startdatum', 'Wo', 'Tag', 'Uhrzeit'].map(text => ({ text })),
      ...people.map(p => ({ text: p, fill: personColor.get(p) }))],
    rows: rows.map(({ s, tag, time, slot, votes, hidden }) => ({
      hidden,
      cells: ['', s.row.sort || '', slot, { text: s.row.romaji || s.row.english, link: s.mal }, { text: s.row.english || s.row.romaji, link: s.mal },
        s.row.start || '', s.row.wo || '', tag || '', time || '', ...people.map(p => votes[p] || '')],
    })),
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${title} Vorschlag.xlsx`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  notice('Downloaded: in Google Sheets, File → Import → Upload → "Insert new sheet(s)"');
}

// The plan as a code for the Season-Helfer script in the sheet (Season-Helfer → "3. Watch-Plan
// einfügen", paste it there): it copies the newest Guckplan tab, so the formatting, dropdowns and
// counts below stay exactly as they are, and fills in these rows. Each row: Sort, Slot, Anime
// Titel, Eng Anime Titel, MyAnimeList link, Startdatum, Wo, Tag, Uhrzeit, hidden, then the votes
// in the order of `people`.
async function copyForSheet(data, plan, times) {
  const { title, people, rows } = guckplanRows(data, plan, times);
  const code = 'GUCKPLAN1:' + JSON.stringify({
    name: `${title} Vorschlag`, people,
    rows: rows.map(({ s, tag, time, slot, votes, hidden }) => [s.row.sort || '', slot, s.row.romaji || s.row.english,
      s.row.english || s.row.romaji, s.mal || '', s.row.start || '', s.row.wo || '', tag || '', time || '', hidden ? 1 : 0,
      ...people.map(p => votes[p] || '')]),
  });
  try {
    await navigator.clipboard.writeText(code);
    notice('Plan code copied: in the sheet, Season-Helfer → "3. Watch-Plan einfügen" and paste it');
  } catch {
    notice("Couldn't copy (the browser didn't allow it)");
  }
}

loadPlanner();
