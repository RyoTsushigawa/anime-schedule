// Every morning at 09:00 German time: posts today's schedule to Discord, exactly as the Discord
// button on a day heading writes it. The page itself builds the message (Guckplan, AniList, moves,
// delays), so this opens the live site in a headless browser instead of copying its logic.
//
//   node tools/discord-daily.mjs            posts now to the webhook in DISCORD_WEBHOOK
//   node tools/discord-daily.mjs --dry-run  only prints the message
//   node tools/discord-daily.mjs --update   after a change to the plan (moves.json, nicknames.json): edits
//                                           today's post so it shows the current plan; no new message, no ping
//   node tools/discord-daily.mjs --test-edit  posts a test line to DISCORD_WEBHOOK_LOGS and edits it (checks editing works)
//
// daily-post.json remembers today's post (date, Discord message id, channel, text), so --update can find it.
//
// Pinning (optional): with the bot's token in DISCORD_BOT_TOKEN the new post is pinned, the line Discord
// writes about it ("… pinned a message") is deleted, and yesterday's post is unpinned. A webhook can't pin,
// only a bot can; the bot's code isn't involved, only its token. The bot needs "Nachrichten anpinnen" and
// "Nachrichten verwalten" in the channel. Pinning never stops the post: a refusal is only logged.
//
// The Cloudflare helper starts the workflow at 08:50 German time (WAIT_FOR_NINE=true); the run then
// waits for 09:00. GitHub's own timer was too unreliable (hours late, or not at all).
import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { boerseLine, previewLine } from './discord-extras.mjs';
import { seasonStart } from '../boerse-core.mjs';

const SITE = process.env.SITE_URL || 'https://ryotsushigawa.github.io/anime-schedule/';
const TZ = 'Europe/Berlin';
const POST_HOUR = 9;
// The weekday roles (@Montag … @Sonntag) pinged at the start of that day's post. Discord: Server
// settings → Roles → right-click the role → Copy Role ID (needs Developer Mode under Advanced).
// An empty ID just leaves the ping out.
const DAY_ROLES = {
  Montag: '1093452925554151474',
  Dienstag: '1093454291672502373',
  Mittwoch: '1093454347901349949',
  Donnerstag: '1093454380063260714',
  Freitag: '1093454416016842833',
  Samstag: '1093454437680427100',
  Sonntag: '1093454458316402788',
};
const dryRun = process.argv.includes('--dry-run');
const update = process.argv.includes('--update');
const webhook = process.env.DISCORD_WEBHOOK || '';
const POST_FILE = 'daily-post.json';
function readRecordedPost() {
  try { return JSON.parse(readFileSync(POST_FILE, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error('Cannot verify the last Discord post from ' + POST_FILE, { cause: error });
  }
}
// A webhook can edit its own messages: .../webhooks/<id>/<token>/messages/<message id>
const editUrl = (hook, id) => { const u = new URL(hook); u.pathname = u.pathname.replace(/\/$/, '') + '/messages/' + id; return u.href; };
const send = async (url, method, content, mentions) => {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, allowed_mentions: mentions }) });
  if (!res.ok) throw new Error(`Discord answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
};

const botToken = process.env.DISCORD_BOT_TOKEN || '';
const API = 'https://discord.com/api/v10';
async function bot(method, path) {
  const res = await fetch(API + path, { method, headers: { Authorization: `Bot ${botToken}`, 'User-Agent': 'DiscordBot (https://github.com/RyoTsushigawa/anime-schedule, 1)' } });
  if (!res.ok) throw new Error(`${method} ${path.replace(/\d{15,}/g, '…')}: Discord answered ${res.status} ${(await res.text()).slice(0, 160)}`);
  return res.status === 204 ? null : res.json();
}
// Pins a message and removes Discord's own "pinned a message" line. Says what happened, never throws.
async function pin(channel, id) {
  if (!botToken) return 'no bot token, not pinned';
  try {
    await bot('PUT', `/channels/${channel}/pins/${id}`);
    await new Promise(r => setTimeout(r, 1500));
    const recent = await bot('GET', `/channels/${channel}/messages?limit=10`);
    const note = recent.find(m => m.type === 6 && m.message_reference?.message_id === id);
    if (note) await bot('DELETE', `/channels/${channel}/messages/${note.id}`);
    return note ? 'pinned, pin notice removed' : 'pinned (no pin notice found)';
  } catch (e) { return 'not pinned: ' + e.message; }
}
async function unpin(channel, id) {
  if (!botToken || !channel || !id) return '';
  try { await bot('DELETE', `/channels/${channel}/pins/${id}`); return 'unpinned the previous post'; }
  catch (e) { return 'previous post not unpinned: ' + e.message; }
}

if (process.argv.includes('--test-edit')) {
  const logs = process.env.DISCORD_WEBHOOK_LOGS || '';
  if (!logs) { console.log('The secret DISCORD_WEBHOOK_LOGS is missing or empty.'); process.exit(1); }
  const first = await send(logs + (logs.includes('?') ? '&' : '?') + 'wait=true', 'POST', '🧪 Test (1/2): diese Nachricht wird gleich bearbeitet.', { parse: [] });
  await new Promise(r => setTimeout(r, 3000));
  await send(editUrl(logs, first.id), 'PATCH', '🧪 Test (2/2): bearbeitet. So aktualisiert sich der Tagespost, ohne neue Nachricht und ohne Ping.', { parse: [] });
  console.log('Posted a test line and edited it.');
  if (botToken) {
    console.log('Pin test: ' + await pin(first.channel_id, first.id));
    await new Promise(r => setTimeout(r, 8000));
    console.log('Pin test: ' + (await unpin(first.channel_id, first.id) || 'nothing to unpin'));
  } else console.log('Pin test skipped: no DISCORD_BOT_TOKEN.');
  process.exit(0);
}

const berlin = (d = new Date()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'shortOffset',
  }).formatToParts(d).map(x => [x.type, x.value]));
  return { ...p, offset: Number(/GMT([+-]\d+)/.exec(p.timeZoneName)?.[1] || 0) };
};

const waitForNine = process.env.WAIT_FOR_NINE === 'true';
const todayIso = (() => { const b = berlin(); return `${b.year}-${b.month}-${b.day}`; })();
const posted = readRecordedPost();
const recordedToday = posted?.date === todayIso && !!posted.id;
if (update && !recordedToday) {
  console.log("Today's post isn't out yet (or wasn't recorded); nothing to update.");
  process.exit(0);
}
if (!update && !dryRun && recordedToday) {
  console.log("Today's post is already recorded; nothing posted.");
  process.exit(0);
}
if (!dryRun && !webhook) {
  console.log('No DISCORD_WEBHOOK secret set; nothing posted.');
  process.exit(0);
}

const browser = await chromium.launch();
try {
  // bypassCSP: the page's security rules forbid code from outside, which would block the checks below
  const page = await browser.newPage({ timezoneId: TZ, locale: 'de-DE', bypassCSP: true });
  page.on('pageerror', e => console.log('page error:', e.message));
  // After a change the published copy lags a minute or more behind: the plan's own files come from this checkout.
  if (update) await page.route(u => u.href.startsWith(SITE) && /\/(moves|nicknames)\.json$/.test(u.pathname), r => {
    const file = new URL(r.request().url()).pathname.split('/').pop();
    return existsSync(file) ? r.fulfill({ path: file, contentType: 'application/json' }) : r.continue();
  });
  await page.goto(SITE, { waitUntil: 'load', timeout: 60_000 });
  // the page's own globals: everything loaded and this week's schedule drawn
  await page.waitForFunction(() => typeof ready !== 'undefined', null, { timeout: 60_000 });
  await page.evaluate(() => ready);
  await page.waitForFunction(() => lastWeekRender && lastWeekRender[1].getTime() === weekStart(0).getTime(),
    null, { timeout: 180_000, polling: 1000 });

  // a GitHub run can start early: wait for 09:00 so "Heute" and any late moves/delays are right
  const t = berlin();
  const wait = ((POST_HOUR - Number(t.hour)) * 3600 - Number(t.minute) * 60 - Number(t.second)) * 1000;
  if (!dryRun && waitForNine && wait > 0) {
    console.log(`Waiting ${Math.round(wait / 60000)} min until ${POST_HOUR}:00 German time.`);
    await page.waitForTimeout(wait);
    await page.evaluate(() => Promise.all([loadMoves(),
      fetch('nicknames.json', { cache: 'no-cache' }).then(r => r.json())
        .then(j => { if (typeof applyNickFile === 'function') applyNickFile(j); else { nicknames = cleanNicknames(j.names); emotes = cleanEmotes(j.emotes); } }).catch(() => {})]));
  }

  // same steps as the Discord button in app.js, nicknames (nicknames.json) included
  const today = await page.evaluate(async () => {
    await nicknamesReady;
    const day = discordDay(isoDay(new Date()));
    return day && { message: discordMessage(day), empty: !day.groups.length };
  });
  if (!today) throw new Error('Today is missing from the rendered week.');
  let message = today.message;
  // extra lines: yesterday at the Börse; before a new season, who still has open Season Preview votes
  const extras = [];
  try { extras.push(boerseLine(JSON.parse(readFileSync('boerse-prices.json', 'utf8')))); } catch (e) { console.log('Börse line skipped: ' + e.message); }
  try {
    const tabs = await page.evaluate(async () => [...(await (await fetch(SHEET + '/htmlview')).text()).matchAll(/\{name: "([^"]+)", pageUrl: "[^"]*gid=(\d+)/g)].map(([, name, gid]) => ({ name: name.trim(), gid })));
    for (const tab of tabs.filter(t => /^(Winter|Frühling|Sommer|Herbst) \d{4}$/.test(t.name))) {
      const days = (seasonStart(tab.name) - Date.now()) / 86400000;
      if (days > 0 && days <= 14) extras.push(previewLine(tab.name, await page.evaluate(gid => sheetRows(gid), tab.gid), Date.now(), SITE));
    }
  } catch (e) { console.log('Season Preview line skipped: ' + e.message); }
  const extra = extras.filter(Boolean).join('\n');
  // Discord takes 2000 characters; the schedule always comes first
  if (extra && message.length + extra.length < 1900) message += '\n\n' + extra;
  const weekday = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, weekday: 'long' }).format(new Date());
  const role = DAY_ROLES[weekday];
  // nothing planned: the note goes out, but nobody is pinged for it
  if (role && !today.empty) message = `<@&${role}>\n\n${message}`;
  console.log(message);
  if (dryRun) {
    // the rest of the week too, as the Discord button would write it, to check the run reads the plan
    const week = await page.evaluate(() => [0, 1, 2, 3, 4, 5, 6].map(i => {
      const d = new Date(lastWeekRender[1]); d.setDate(d.getDate() + i);
      const day = discordDay(isoDay(d));
      return day ? `--- ${isoDay(d)} ---\n${discordMessage(day)}` : `--- ${isoDay(d)}: missing ---`;
    }));
    console.log('\nThis week (dry run only):\n' + week.join('\n'));
    if (update) console.log(posted.text === message ? '\nUpdate: the post is still right.' : '\nUpdate: the post would be edited.');
    process.exit(0);
  }

  if (update) {
    if (posted.text === message) { console.log('The post is still right; nothing edited.'); process.exit(0); }
    // an edit never pings, so nobody is notified twice
    await send(editUrl(webhook, posted.id), 'PATCH', message, { parse: [] });
    writeFileSync(POST_FILE, JSON.stringify({ ...posted, text: message, edited: new Date().toISOString() }, null, 1) + '\n');
    console.log("Edited today's post.");
    process.exit(0);
  }

  // role pings (e.g. Sophie's) go through, @everyone/@here never
  const sent = await send(webhook + (webhook.includes('?') ? '&' : '?') + 'wait=true', 'POST', message, { parse: ['roles', 'users'] });
  writeFileSync(POST_FILE, JSON.stringify({ date: todayIso, id: sent.id, channel: sent.channel_id, text: message }, null, 1) + '\n');
  // the new post is pinned, the one from the day before is let go
  const pinned = await pin(sent.channel_id, sent.id);
  console.log('Pin: ' + pinned);
  if (pinned.startsWith('pinned') && posted?.id && posted.id !== sent.id) console.log('Pin: ' + await unpin(posted.channel || sent.channel_id, posted.id));
  console.log('Posted to Discord.');
} finally {
  await browser.close();
}
