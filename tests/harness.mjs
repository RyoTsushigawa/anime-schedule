// Opens the real page (index.html + common.js + app.js) in jsdom with a fixed clock and fake
// answers from AniList, Google Sheets and the site, so whole workflows can be clicked through
// without a browser or the network. Each test gets a fresh page; `fail` makes a source fail.
process.env.TZ = 'Europe/Berlin';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { after } from 'node:test';

// Pages still open when a test fails halfway would keep their timers (and the run) going
const open = new Set();
after(() => { for (const window of open) window.close(); });

import { slim, SLIMMED } from '../tools/slim.mjs';

// SLIM=1 (publish.mjs): the page as published, without comments (tools/slim.mjs)
const read = file => { const text = readFileSync(new URL('../' + file, import.meta.url), 'utf8'); return process.env.SLIM && SLIMMED.includes(file) ? slim(file, text) : text; };
export const sec = (...utc) => Date.UTC(...utc) / 1000;

// Wednesday 28 Oct 2026, 12:00 in Berlin; the week runs Mon 26 Oct – Sun 1 Nov.
export const NOW = Date.UTC(2026, 9, 28, 11);

// The Guckplan: Alpha Wednesday 20:00 (both), Beta Saturday without a time (MaRyo only),
// Gamma Thursday 21:00 with no episode this week (LiveChart: break for sports coverage).
const CSV = [
  'Anime Titel,Eng Anime Titel,Wo,Tag,Uhrzeit,MaRyo,Belly',
  'Show Alpha,Alpha EN,C,Mi.,20:00,Ja,Ja',
  'Show Beta,Beta EN,C,Sa.,,Ja,Nein',
  'Show Gamma,Gamma EN,C,Do.,21:00,Ja,Ja',
].join('\n');
const media = (id, name) => ({
  id, idMal: id + 100, isAdult: false, siteUrl: `https://anilist.co/anime/${id}`, title: { romaji: `Show ${name}`, english: `${name} EN` },
  synonyms: [], coverImage: { medium: 'https://img.anili.st/x.png' }, externalLinks: [{ site: 'Crunchyroll', url: `https://www.crunchyroll.com/${id}` }],
  status: 'RELEASING', episodes: 12, startDate: { year: 2026, month: 10, day: 1 },
});
export const MEDIA = { 1: media(1, 'Alpha'), 2: media(2, 'Beta'), 3: media(3, 'Gamma'), 4: media(4, 'Delta') };
const AIRINGS = [
  { airingAt: sec(2026, 9, 21, 14), episode: 3, media: MEDIA[1] },
  { airingAt: sec(2026, 9, 28, 14), episode: 4, media: MEDIA[1] }, // Wed 15:00
  { airingAt: sec(2026, 9, 23, 16), episode: 1, media: MEDIA[2] },
  { airingAt: sec(2026, 9, 30, 16), episode: 2, media: MEDIA[2] }, // Fri 17:00 → watched Saturday
  { airingAt: sec(2026, 10, 2, 14), episode: 5, media: MEDIA[1] }, // next week
];
const STREAMS = {
  generated: new Date(NOW).toISOString(),
  byAnilist: { 1: [{ name: 'Crunchyroll', url: 'https://www.crunchyroll.com/alpha' }] },
  release: {},
  status: {
    1: { titles: ['Show Alpha', 'Alpha EN'], next: { episode: 5, at: sec(2026, 10, 4, 14) } },
    2: { titles: ['Show Beta', 'Beta EN'], next: { episode: 3, at: sec(2026, 10, 6, 16) } },
    3: { titles: ['Show Gamma', 'Gamma EN'], next: { episode: 5, at: sec(2026, 10, 5, 20) },
      notes: [{ at: sec(2026, 9, 29, 20), text: 'No broadcast today due to sports coverage.' }] },
  },
};

const json = (body, status = 200) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
const text = (body, status = 200) => ({ ok: status < 300, status, json: async () => JSON.parse(body), text: async () => body });

// opts.storage: localStorage to start with; opts.list: the viewer's AniList entries; opts.search: title → AniList's answer to a title search
// { mediaId: { progress, status } }; opts.fail: Set of 'anilist' | 'sheets' | 'site' | 'streams'.
// A different week or season: opts.now (the clock), opts.sheets ({ tabs: [[name, gid]], csv: { gid: text } }),
// opts.airings and opts.streams instead of the ones above.
export async function openPage(opts = {}) {
  const html = read(opts.wrapped ? 'wrapped.html' : 'index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM(html, { url: 'https://ryotsushigawa.github.io/anime-schedule/' + (opts.hash || ''), runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  open.add(window);
  const fail = opts.fail || new Set();
  const list = structuredClone(opts.list || {});
  const calls = [];
  const malList = structuredClone(opts.malList || {}), malCalls = [];
  const malNode = id => ({ id:id+100, title:MEDIA[id].title.romaji, status:opts.malMediaStatus?.[id] || 'currently_airing', num_episodes:12,
    start_date:'2026-10-01', main_picture:{medium:''} });
  const malStatus = e => ({ status:e.status || 'watching', num_episodes_watched:e.progress || 0, score:e.score || 0, is_rewatching:e.rewatching || false, finish_date:e.finish_date });
  for (const [k, v] of Object.entries(opts.storage || {})) window.localStorage.setItem(k, v);
  for (const [k, v] of Object.entries(opts.session || {})) window.sessionStorage.setItem(k, v);

  const anilist = body => {
    const { query, variables: v = {} } = JSON.parse(body);
    calls.push({ query, variables: v });
    if (query.includes('airingSchedules'))
      return { Page: { pageInfo: { hasNextPage: false }, airingSchedules: (opts.airings || AIRINGS).filter(a => a.airingAt > v.from && a.airingAt < v.to && (!v.ids || v.ids.includes(a.media.id))) } };
    if (query.includes('Viewer')) return { Viewer: { name: 'Tester', avatar: { medium: '' }, mediaListOptions: { scoreFormat: opts.scoreFormat || 'POINT_10_DECIMAL' } } };
    if (query.includes('SaveMediaListEntry')) {
      const entry = list[v.mediaId] || { progress: 0, status: 'PLANNING' };
      list[v.mediaId] = { score: 0, ...entry, ...(v.progress !== undefined && { progress: v.progress }), ...(v.status && { status: v.status }), ...(v.score !== undefined && { score: v.score }) };
      // Like AniList: the last episode ticked makes it Completed (with today's date)
      if (v.progress === MEDIA[v.mediaId].episodes) Object.assign(list[v.mediaId], { status: 'COMPLETED', completedAt: { year: 2026, month: 10, day: 28 } });
      return { SaveMediaListEntry: { id: 900 + v.mediaId, ...list[v.mediaId] } };
    }
    if (query.includes('DeleteMediaListEntry')) { delete list[v.id - 900]; return { DeleteMediaListEntry: { deleted: true } }; }
    if (query.includes('mediaListEntry { progress status score } } }'))
      return { Media: { mediaListEntry: list[v.id] ? { progress: list[v.id].progress, status: list[v.id].status, score: list[v.id].score || 0 } : null } };
    if (query.includes('MediaListCollection')) {
      // No status filter (Wrapped) → the whole list, like AniList
      const wanted = query.includes('DROPPED') ? ['DROPPED'] : query.includes('COMPLETED') ? ['COMPLETED'] : query.includes('CURRENT') ? ['CURRENT', 'REPEATING'] : ['CURRENT', 'REPEATING', 'COMPLETED', 'DROPPED', 'PAUSED', 'PLANNING'];
      const entries = Object.entries(list).filter(([, e]) => wanted.includes(e.status))
        .map(([id, e]) => ({ score: 0, ...e, media: { ...MEDIA[id], nextAiringEpisode: opts.listNext?.[id] || { episode: 5, airingAt: sec(2026, 10, 4, 14) } } }));
      return { MediaListCollection: { lists: [{ entries }] } };
    }
    if (query.includes('idMal_in')) return { Page: { media:(v.malIds || []).map(id => MEDIA[id-100]).filter(Boolean).map(m => ({...m,nextAiringEpisode:{episode:5,airingAt:sec(2026,10,4,14)}})) } };
    // opts.planNext: { episode, airingAt } as every looked-up show's next episode (default none)
    if (query.includes('id_in')) return { Page: { media: (v.ids || []).map(id => MEDIA[id]).filter(Boolean).map(m => opts.planNext ? { ...m, nextAiringEpisode: opts.planNext } : m) } };
    if (query.includes('Media(id:')) return { Media: MEDIA[v.id] };
    if (query.includes('Media(search')) return { Media: opts.search?.[v.search] ?? null };
    throw new Error('unexpected AniList query: ' + query.slice(0, 60));
  };
  window.fetch = async (url, init = {}) => {
    url = String(url);
    const down = name => fail.has(name) ? Promise.reject(new TypeError('Failed to fetch')) : null;
    if (url.includes('anime-schedule-mal.shigeruhagano.workers.dev')) {
      if (fail.has('mal')) return Promise.reject(new TypeError('MAL is down'));
      const path = new URL(url).pathname, method = init.method || 'GET';
      malCalls.push({path,method,body:init.body,headers:init.headers});
      // opts.malRenewedUntil: the helper's X-Session-Expires on its answers (a renewed session)
      if (path === '/me') { const res = json({id:42,name:'MalTester',picture:opts.malAvatar || ''}); if (opts.malRenewedUntil) res.headers = { get: k => k.toLowerCase() === 'x-session-expires' ? String(opts.malRenewedUntil) : null }; return res; }
      if (path === '/auth/exchange') return json({session:'a'.repeat(64)});
      if (path === '/logout') return json({loggedOut:true});
      if (path === '/list') return json({data:Object.entries(malList).map(([id,e])=>({node:malNode(+id),list_status:malStatus(e)})),paging:{}});
      const id = Number(path.split('/').at(-1)) - 100;
      if (!MEDIA[id]) return json({error:'No matching show'},404);
      if (method === 'GET') return json({...malNode(id),...(malList[id] && {my_list_status:malStatus(malList[id])})});
      if (method === 'DELETE') {delete malList[id]; return json({deleted:true});}
      if (method === 'PUT') {
        const v = JSON.parse(init.body), before = malList[id] || {progress:0,status:'plan_to_watch',score:0};
        malList[id] = {...before,...(v.num_watched_episodes !== undefined && {progress:v.num_watched_episodes}),...(v.status && {status:v.status}),...(v.score !== undefined && {score:v.score}),...(v.is_rewatching !== undefined && {rewatching:v.is_rewatching})};
        return json(malStatus(malList[id]));
      }
    }
    if (url.includes('graphql.anilist.co')) {
      const failed = down('anilist'); if (failed) return failed;
      const res = json({ data: anilist(init.body) });
      // opts.rateLimit({ query, variables }) → { limit, remaining }: AniList's limit headers
      const h = opts.rateLimit?.(calls.at(-1));
      if (h) res.headers = { get: k => ({ 'x-ratelimit-limit': String(h.limit), 'x-ratelimit-remaining': String(h.remaining) })[k.toLowerCase()] ?? null };
      return res;
    }
    if (url.includes('docs.google.com')) {
      if(opts.blockSheetExports)throw new TypeError('NetworkError when attempting to fetch resource');
      if (fail.has('sheets')) return down('sheets');
      const tabs = opts.sheets?.tabs || [['Guckplan Herbst 2026', 111], ['Herbst 2026', 222]];
      if (url.includes('/htmlview')) return text(tabs.map(([name, gid]) => `{name: "${name}", pageUrl: "x?gid=${gid}"}`).join(' '));
      return text(opts.sheets?.csv?.[url.match(/gid=(\d+)/)?.[1]] ?? CSV);
    }
    if (url.includes('streams-de.json')) return down('streams') || down('site') || json(opts.streams || STREAMS);
    if (url.includes('wrapped-profiles.json')) return json(JSON.parse(read('wrapped-profiles.json')));
    if (url.includes('fallback-links.json')) return down('site') || json({ byAnilist: {} });
    if (url.includes('moves.json') && !url.includes('api.github.com')) return down('site') || (opts.movesFile ? json(opts.movesFile) : json({}, 404));
    // The moves file on GitHub: reading gives a sha, a PUT is kept (decoded) in state.movesSaved
    if (url.includes('api.github.com') && url.includes('moves.json')) {
      if ((init.method || 'GET') === 'PUT') { state.movesSaved = JSON.parse(decodeURIComponent(escape(atob(JSON.parse(init.body).content)))); return json({}); }
      const file = state.movesSaved || opts.githubFile || opts.movesFile || { moves: [] };
      return json({ sha: 'abc', content: btoa(unescape(encodeURIComponent(JSON.stringify(file)))) });
    }
    if (url.includes('sheets.googleapis.com')) {
      if(fail.has('sheets'))return down('sheets');
      if(opts.sheetApi && url.includes('/values/'))return json({values:opts.sheetApi.values});
      if(opts.sheetApi && url.includes('properties'))return json({sheets:[{properties:{title:'Guckplan Herbst 2026',sheetId:111}}]});
      return json(opts.sheetMetadata || {sheets:[{data:[{}]}]});
    }
    if (url.includes('config.json')) return json(opts.config || (opts.wrapped ? {sheetsKey:'fake-key'} : {}));
    // The site's copy of the tab list (opts.tabsFile, as [[name, gid, catalogGid, start]]); none by default
    if (url.includes('tabs.json')) { state.tabsFileReads = (state.tabsFileReads || 0) + 1; return down('site') || (opts.tabsFile ? json(opts.tabsFile) : json({}, 404)); }
    // The delay helper (opts.config.delaysUrl): each POST is kept in state.delayPosts; it answers
    // with the file as it would be after an "add"
    if (opts.config?.delaysUrl && url === opts.config.delaysUrl) {
      if (opts.delaysDown) { state.delayTries = (state.delayTries || 0) + 1; throw new TypeError('Failed to fetch'); }
      const op = JSON.parse(init.body);
      (state.delayPosts ||= []).push(op);
      return json({ updated: new Date(NOW).toISOString(), moves: [], delays: op.add ? [op.add] : [], ...(op.remember && { reasons: [op.add.reason] }) });
    }
    throw new Error('unexpected fetch: ' + url);
  };

  // Fixed clock (tests can move it on with page.advance), and what jsdom doesn't have
  const ctx = dom.getInternalVMContext();
  vm.runInContext(`(() => {
    const Real = Date; let now = ${opts.now ?? NOW};
    globalThis.__advance = ms => { now += ms; };
    globalThis.Date = class extends Real {
      constructor(...a) { super(...(a.length ? a : [now])); }
      static now() { return now; }
    };
  })();`, ctx);
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.scrollTo = window.scrollBy = () => {};
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event('close')); };
  const state = { offline: !!opts.offline };
  Object.defineProperty(window.navigator, 'onLine', { get: () => !state.offline, configurable: true });
  window.console.warn = () => {};

  for (const file of (opts.wrapped ? ['common.js', 'mal.js', 'wrapped-data.js', 'wrapped.js'] : [...(opts.early ? ['early.js'] : []), 'common.js', 'mal.js', 'app.js', 'drag-moves.js'])) vm.runInContext(read(file), ctx, { filename: file });

  const page = {
    window, document: window.document, calls, list, malList, malCalls, fail, state,
    storage: () => Object.fromEntries(Object.keys(window.localStorage).map(k => [k, window.localStorage.getItem(k)])),
    notes: () => [...window.document.querySelectorAll('.datanote div')].map(d => d.textContent),
    $: id => window.document.getElementById(id),
    run: code => vm.runInContext(code, ctx),
    advance: ms => vm.runInContext(`__advance(${ms})`, ctx),
    // Waits until the page has nothing left to do (its own requests and redraws)
    settle: async (ms = 150) => { for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, ms / 6)); },
    click: async (el, ms) => { el.click(); await page.settle(ms); },
    days: () => [...window.document.querySelectorAll('#list .day h2')].map(h => h.getAttribute('title') || h.textContent),
    rows: () => [...window.document.querySelectorAll('#list .row')].map(r => r.querySelector('.title')?.textContent.trim()),
    close: () => window.close(),
  };
  await page.settle(300);
  return page;
}
