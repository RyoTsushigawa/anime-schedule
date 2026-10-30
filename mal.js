// MyAnimeList account operations. Only the opaque helper session leaves browser storage;
// MAL access/refresh tokens and the client secret remain in the Cloudflare helper.
const MAL = (() => {
  const base = 'https://anime-schedule-mal.shigeruhagano.workers.dev';
  const statuses = { watching: 'CURRENT', completed: 'COMPLETED', on_hold: 'PAUSED', dropped: 'DROPPED', plan_to_watch: 'PLANNING' };
  const reverse = Object.fromEntries(Object.entries(statuses).map(([a, b]) => [b, a]));
  const metadata = new Map(), details = new Map(), flights = new Map();
  let rowsCache = new Map();
  try { for (const m of JSON.parse(localStorage.getItem('malMediaMap') || '[]')) if (m.idMal > 0 && m.id > 0) metadata.set(m.idMal, m); } catch {}
  const fields = 'id idMal status episodes siteUrl synonyms title { romaji english } coverImage { medium } externalLinks { site url } nextAiringEpisode { episode airingAt } startDate { year month day } endDate { year month day }';
  const cacheKey = account => 'malList:' + account.name.toLowerCase();
  function rememberMedia(media) {
    if (!(media?.id > 0 && media.idMal > 0)) return;
    const before = metadata.get(media.idMal) || {};
    const clean = { ...before, id: media.id, idMal: media.idMal };
    for (const k of ['title','status','episodes','siteUrl','synonyms','coverImage','externalLinks','nextAiringEpisode','startDate','endDate'])
      if (media[k] !== undefined) clean[k] = media[k];
    if (JSON.stringify(before) === JSON.stringify(clean)) return;
    metadata.set(media.idMal, clean);
    try { localStorage.setItem('malMediaMap', JSON.stringify([...metadata.values()].slice(-3000))); } catch {}
  }
  function seed(index) {
    for (const [id, value] of Object.entries(index?.byAnilist || {})) if (value.malId > 0 && !metadata.has(value.malId))
      rememberMedia({ id: Number(id), idMal: value.malId, title: { romaji: value.title, english: value.title } });
  }
  async function request(account, path, options = {}) {
    const response = await fetch(base + path, { ...options, redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(account?.token ? { Authorization: 'Bearer ' + account.token } : {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(body.error || 'MyAnimeList is not answering. Try again.'), { status: response.status });
    return body;
  }
  const profile = account => request(account, '/me');
  async function exchange(code) {
    if (!/^[a-f0-9]{64}$/.test(code)) throw new Error('Invalid MyAnimeList login code. Connect again.');
    const { session } = await request(null, '/auth/exchange', { method: 'POST', body: JSON.stringify({ code }) });
    const account = { provider: 'mal', token: session, expires: Date.now() + 30 * 86400000, scoreFormat: 'POINT_10' };
    const me = await profile(account);
    return { ...account, name: me.name, avatar: '' };
  }
  const normalizedEntry = value => value ? { progress: value.num_episodes_watched ?? value.num_watched_episodes ?? 0,
    status: value.is_rewatching ? 'REPEATING' : statuses[value.status] || 'PLANNING', score: value.score || 0 } : null;
  const dateParts = value => value && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? { year: +value.slice(0, 4), month: +value.slice(5, 7), day: +value.slice(8, 10) } : null;
  function mediaFor(node) {
    const known = metadata.get(node.id) || {};
    return { ...known, id: known.id || -node.id, idMal: node.id,
      title: known.title || { romaji: node.title, english: node.title },
      synonyms: [...new Set([...(known.synonyms || []), ...(node.alternative_titles?.synonyms || []), node.alternative_titles?.en].filter(Boolean))],
      status: ({ finished_airing: 'FINISHED', currently_airing: 'RELEASING', not_yet_aired: 'NOT_YET_RELEASED' })[node.status] || known.status,
      episodes: node.num_episodes || known.episodes || null,
      startDate: dateParts(node.start_date) || known.startDate,
      endDate: dateParts(node.end_date) || known.endDate,
      siteUrl: `https://myanimelist.net/anime/${node.id}`,
      coverImage: known.coverImage || { medium: node.main_picture?.medium || '' }, externalLinks: known.externalLinks || [],
    };
  }
  async function enrich(nodes) {
    const ids = nodes.map(n => n.id);
    for (let i = 0; i < ids.length; i += 50) {
      try {
        const data = await anilist(`query ($malIds: [Int]) { Page(perPage: 50) { media(idMal_in: $malIds, type: ANIME) { ${fields} } } }`,
          { malIds: ids.slice(i, i + 50) }, undefined, { retries: 0, timeout: 8000 });
        for (const m of data.Page.media) rememberMedia(m);
      } catch { break; } // Native MAL records remain usable while AniList is down.
    }
  }
  async function list(account, fresh = false) {
    const key = cacheKey(account);
    let saved = rowsCache.get(key);
    if (!saved) try { saved = JSON.parse(localStorage.getItem(key)); } catch {}
    if (!fresh && saved && Date.now() - saved.time < 600000) return convert(saved.rows, null);
    if (flights.has(account.token)) return flights.get(account.token);
    const job = (async () => {
      try {
        const rows = [];
        let offset = 0;
        for (let page = 0; ; page++) {
          if (page >= 100) throw new Error('MyAnimeList list was incomplete. Try refreshing.');
          const data = await request(account, '/list?offset=' + offset);
          if (!Array.isArray(data.data)) throw new Error('MyAnimeList returned an incomplete list.');
          rows.push(...data.data);
          if (!data.paging?.next) break;
          const next = Number(new URL(data.paging.next).searchParams.get('offset'));
          if (!Number.isInteger(next) || next <= offset) throw new Error('MyAnimeList pagination did not advance.');
          offset = next;
        }
        await enrich(rows.map(r => r.node));
        const snapshot = { time: Date.now(), rows };
        rowsCache.set(key, snapshot);
        try { localStorage.setItem(key, JSON.stringify(snapshot)); } catch {}
        return convert(rows, null);
      } catch (error) {
        if (!saved || error.status === 401) throw error;
        return convert(saved.rows, saved.time);
      }
    })();
    flights.set(account.token, job);
    try { return await job; } finally { flights.delete(account.token); }
  }
  function convert(rows, stale) {
    return { stale, entries: rows.map(({ node, list_status: entry }) => ({ ...normalizedEntry(entry),
      completedAt: dateParts(entry?.finish_date), media: mediaFor(node) })) };
  }
  async function resolve(id) {
    if (id < 0) return -id;
    const known = [...metadata.values()].find(m => m.id === id);
    if (known) return known.idMal;
    const { Media } = await anilist(`query ($id: Int) { Media(id: $id, type: ANIME) { ${fields} } }`, { id }, undefined, { retries: 0 });
    rememberMedia(Media);
    if (!Media?.idMal) throw new Error('This show has no confirmed MyAnimeList ID. No list change was made.');
    return Media.idMal;
  }
  async function anilistId(id) {
    if (id > 0) return id;
    if (!metadata.has(-id)) await enrich([{id:-id}]);
    const known = metadata.get(-id);
    if (!known?.id) throw new Error('No confirmed AniList ID is available for this show; the other list was not changed.');
    return known.id;
  }
  async function entry(account, id) {
    const malId = await resolve(id);
    const node = await request(account, '/anime/' + malId);
    details.set(malId, node);
    return normalizedEntry(node.my_list_status);
  }
  function invalidate(account) {
    const key = cacheKey(account);
    rowsCache.delete(key);
    try { localStorage.removeItem(key); } catch {}
  }
  async function save(account, id, vars, autoComplete = false) {
    const malId = await resolve(id), data = {};
    if (vars.progress !== undefined) data.num_watched_episodes = vars.progress;
    if (vars.score !== undefined) data.score = vars.score;
    if (vars.status) {
      data.status = vars.status === 'REPEATING' ? 'watching' : reverse[vars.status];
      data.is_rewatching = vars.status === 'REPEATING';
    }
    const node = details.get(malId);
    if (autoComplete && vars.progress !== undefined && node?.status === 'finished_airing' && node.num_episodes > 0 && vars.progress >= node.num_episodes
      && (!vars.status || ['CURRENT','REPEATING'].includes(vars.status))) { data.status = 'completed'; data.is_rewatching = false; }
    const saved = await request(account, '/anime/' + malId, { method: 'PUT', body: JSON.stringify(data) });
    invalidate(account);
    return { id: malId, ...normalizedEntry(saved) };
  }
  async function remove(account, malId) {
    await request(account, '/anime/' + malId, { method: 'DELETE' }); invalidate(account);
  }
  return { rememberMedia, seed, exchange, profile, list, entry, save, remove, invalidate, anilistId,
    connect: () => { location.href = base + '/auth/start'; },
    logout: account => request(account, '/logout', { method: 'POST' }),
  };
})();
