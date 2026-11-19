// Pocket-Sammlung backend (Cloudflare Worker, KV binding POCKET). Standalone: nothing from the schedule site.
//   "person:<name>" = { accounts: [{ id, name, friendId? }], owned: { <account>: { <card id>: copies } }, wish: [], chase: [], at }
//   "pin:<name>"    = { salt, hash, at, fails?, lockedUntil? }   (salted SHA-256, never the PIN itself)
// Routes (all JSON, CORS only for SITE_ORIGIN; with the secret GROUP_CODE set, every request needs X-Group-Code):
//   GET  /pocket              everyone's collection (trades are arranged on Discord, so the group sees all)
//   POST /join  { person }    a new person, with the PIN in X-Pocket-Pin
//   POST /login { person }    checks the PIN
//   POST /pocket { person, since, record }  saves your own; "since" is the "at" you loaded, a newer one answers 409
//   POST /trade { person, partner, gave, got }  a trade done in the game: you lose "gave" and get "got" on the account
//        that held "gave"; the partner the other way round on their account that held "got". Both records get an
//        entry in "trades" (the last 50), so the partner sees it and either can undo it.
//   POST /trade/undo { person, id }  reverses a trade on both sides (only one you are part of)
//   POST /pin-reset { person } with X-Admin-Key = the secret ADMIN_KEY: forgets a PIN, the person sets a new one
const json = (data, status, headers) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const fail = (status, error) => { throw Object.assign(new Error(error), { status }); };
const str = v => typeof v === 'string' ? v.trim() : '';
export const NAME = /^[\p{L}\p{N} ._'-]{1,30}$/u;
const CARD = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)?-\d{1,4}$/, ACCOUNT = /^[a-z0-9]{1,12}$/;
const MAX_PEOPLE = 30, MAX_BODY = 600000;

function corsFor(request, env) {
  const origin = request.headers.get('Origin') || '', allowed = (env.SITE_ORIGIN || 'https://ryotsushigawa.github.io').split(',').map(s => s.trim());
  if (!allowed.includes(origin)) return null;
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Group-Code, X-Pocket-Pin, X-Admin-Key', Vary: 'Origin' };
}
async function sha(text) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function same(a, b) { const [x, y] = await Promise.all([sha(a), sha(b)]); let d = 0; for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i); return d === 0; }
async function group(request, env) {
  const code = str(env.GROUP_CODE);
  if (code && !(await same(code, str(request.headers.get('X-Group-Code'))))) fail(401, 'group code');
}
const store = env => env.POCKET || fail(503, 'not set up');
const person = v => { const p = str(v); if (!NAME.test(p)) fail(400, 'invalid name'); return p; };
const pinOf = request => { const pin = str(request.headers.get('X-Pocket-Pin')); if (!/^\S{4,32}$/.test(pin)) fail(401, 'pin needed'); return pin; };

async function checkPin(request, env, who) {
  const pin = pinOf(request), key = 'pin:' + who;
  const saved = JSON.parse(await store(env).get(key) || 'null');
  if (!saved) fail(404, 'unknown person');
  if (saved.lockedUntil && Date.parse(saved.lockedUntil) > Date.now()) fail(429, 'locked');
  if (await sha(saved.salt + pin) !== saved.hash) {
    const fails = (saved.fails || 0) + 1;
    await store(env).put(key, JSON.stringify({ ...saved, fails: fails >= 5 ? 0 : fails, ...(fails >= 5 && { lockedUntil: new Date(Date.now() + 900000).toISOString() }) }));
    fail(403, 'wrong pin');
  }
  if (saved.fails || saved.lockedUntil) await store(env).put(key, JSON.stringify({ salt: saved.salt, hash: saved.hash, at: saved.at }));
}
async function names(env) {
  const out = []; let cursor;
  do { const page = await store(env).list({ prefix: 'pin:', cursor }); out.push(...page.keys.map(k => k.name.slice(4))); cursor = page.list_complete ? undefined : page.cursor; } while (cursor);
  return out;
}

export function cleanRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'invalid collection');
  const accounts = Array.isArray(value.accounts) ? value.accounts : [];
  if (!accounts.length || accounts.length > 6) fail(400, '1 to 6 accounts');
  const ids = new Set(), out = { accounts: [], owned: {}, wish: [], chase: [] };
  for (const a of accounts) {
    const id = str(a?.id), name = str(a?.name), friendId = str(a?.friendId);
    if (!ACCOUNT.test(id) || ids.has(id)) fail(400, 'invalid account');
    if (!name || name.length > 30 || /[<>]/.test(name)) fail(400, 'invalid account name');
    if (friendId && !/^[\d -]{4,24}$/.test(friendId)) fail(400, 'invalid friend id');
    ids.add(id); out.accounts.push({ id, name, ...(friendId && { friendId }) });
    const owned = value.owned?.[id] || {};
    if (typeof owned !== 'object' || Array.isArray(owned)) fail(400, 'invalid collection');
    const entries = Object.entries(owned);
    if (entries.length > 8000) fail(400, 'too many cards');
    out.owned[id] = {};
    for (const [card, n] of entries) {
      if (!CARD.test(card) || !Number.isInteger(n) || n < 0 || n > 99) fail(400, 'invalid card');
      if (n > 0) out.owned[id][card] = n;
    }
  }
  for (const list of ['wish', 'chase']) {
    const v = value[list] || [];
    if (!Array.isArray(v) || v.length > 3000 || v.some(c => typeof c !== 'string' || !CARD.test(c))) fail(400, 'invalid wishlist');
    out[list] = [...new Set(v)];
  }
  out.wish = out.wish.filter(c => !out.chase.includes(c));
  return out;
}

// the account a traded card leaves from: the one holding the most copies
function holder(record, card) {
  const best = [...record.accounts].sort((a, b) => (record.owned?.[b.id]?.[card] || 0) - (record.owned?.[a.id]?.[card] || 0))[0];
  return best && record.owned?.[best.id]?.[card] > 0 ? best.id : '';
}
function move(record, account, card, delta) {
  const owned = record.owned[account] ||= {};
  const n = Math.max(0, Math.min(99, (owned[card] || 0) + delta));
  if (n) owned[card] = n; else delete owned[card];
}
async function saveTrade(env, me, other, entry, at, who, partner, undo = false) {
  const log = (record) => { const list = (record.trades || []).filter(t => t.id !== entry.id); return [...list, entry].slice(-50); };
  for (const [name, record] of [[who, me], [partner, other]]) {
    if (!record) continue;
    record.trades = log(record); record.at = at;
    await store(env).put('person:' + name, JSON.stringify(record));
  }
  return { ok: true, trade: entry, record: me, partner: other, undone: undo };
}

async function route(request, env, path, now) {
  if (request.method === 'GET' && path === '/health') return { ok: true };
  await group(request, env);
  if (request.method === 'GET' && path === '/pocket') {
    const people = {};
    for (const who of await names(env)) people[who] = JSON.parse(await store(env).get('person:' + who) || 'null') || { accounts: [] };
    return { people };
  }
  if (request.method !== 'POST') fail(404, 'not found');
  const raw = await request.text();
  if (raw.length > MAX_BODY) fail(413, 'too large');
  let body; try { body = JSON.parse(raw); } catch { fail(400, 'invalid request'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'invalid request');
  const who = person(body.person);
  if (path === '/join') {
    const pin = pinOf(request);
    if (await store(env).get('pin:' + who)) fail(409, 'name taken');
    const all = await names(env);
    if (all.length >= MAX_PEOPLE) fail(403, 'group full');
    if (all.some(n => n.toLowerCase() === who.toLowerCase())) fail(409, 'name taken');
    const salt = crypto.randomUUID();
    await store(env).put('pin:' + who, JSON.stringify({ salt, hash: await sha(salt + pin), at: new Date(now).toISOString() }));
    return { ok: true, person: who };
  }
  if (path === '/login') { await checkPin(request, env, who); return { ok: true, person: who }; }
  if (path === '/pocket') {
    await checkPin(request, env, who);
    const key = 'person:' + who, old = JSON.parse(await store(env).get(key) || 'null');
    if (old?.at && str(body.since) !== old.at) return { status: 409, body: { conflict: true, record: old } };
    // the trade history is the server's: a page can't change or drop it
    const record = { ...cleanRecord(body.record), ...(old?.trades?.length && { trades: old.trades }), at: new Date(now).toISOString() };
    await store(env).put(key, JSON.stringify(record));
    return { ok: true, record };
  }
  if (path === '/trade' || path === '/trade/undo') {
    await checkPin(request, env, who);
    const at = new Date(now).toISOString(), load = async p => JSON.parse(await store(env).get('person:' + p) || 'null');
    const me = await load(who);
    if (!me?.accounts?.length) fail(404, 'unknown person');
    let partner, entry, undo = false;
    if (path === '/trade') {
      partner = person(body.partner);
      const gave = str(body.gave), got = str(body.got);
      if (partner === who || !CARD.test(gave) || !CARD.test(got) || gave === got) fail(400, 'invalid trade');
      const other = await load(partner);
      if (!other?.accounts?.length) fail(404, 'unknown person');
      const from = holder(me, gave), to = holder(other, got);
      if (!from || !to) fail(409, 'card not owned');
      entry = { id: crypto.randomUUID().slice(0, 12), at, by: who, a: who, b: partner, aAccount: from, bAccount: to, gave, got };
      move(me, from, gave, -1); move(me, from, got, 1); move(other, to, got, -1); move(other, to, gave, 1);
      return await saveTrade(env, me, other, entry, at, who, partner);
    }
    const id = str(body.id);
    entry = (me.trades || []).find(t => t.id === id);
    if (!entry || entry.undone) fail(404, 'unknown trade');
    partner = entry.a === who ? entry.b : entry.a;
    const other = await load(partner);
    const [A, B] = entry.a === who ? [me, other] : [other, me];
    if (A) { move(A, entry.aAccount, entry.gave, 1); move(A, entry.aAccount, entry.got, -1); }
    if (B) { move(B, entry.bAccount, entry.got, 1); move(B, entry.bAccount, entry.gave, -1); }
    undo = true;
    return await saveTrade(env, me, other, { ...entry, undone: at }, at, who, partner, undo);
  }
  if (path === '/pin-reset') {
    const admin = str(env.ADMIN_KEY);
    if (!admin || admin.length < 16 || !(await same(admin, str(request.headers.get('X-Admin-Key'))))) fail(403, 'admin only');
    await store(env).delete('pin:' + who);
    return { ok: true, person: who };
  }
  fail(404, 'not found');
}

export default {
  async fetch(request, env) {
    const cors = corsFor(request, env);
    if (!cors) return json({ error: 'origin not allowed' }, 403, {});
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const path = new URL(request.url).pathname.replace(/\/$/, '');
    try {
      const out = await route(request, env, path, Number(env.TEST_NOW) || Date.now());
      return out?.status ? json(out.body, out.status, cors) : json(out, 200, cors);
    } catch (error) { return json({ error: error?.status ? error.message : 'server error' }, error?.status || 500, cors); }
  },
};
