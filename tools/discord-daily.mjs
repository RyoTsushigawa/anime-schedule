// Every morning at 09:00 German time: posts today's schedule to Discord, exactly as the Discord
// button on a day heading writes it. The page itself builds the message (Guckplan, AniList, moves,
// delays), so this opens the live site in a headless browser instead of copying its logic.
//
//   node tools/discord-daily.mjs            posts now to the webhook in DISCORD_WEBHOOK
//   node tools/discord-daily.mjs --dry-run  only prints the message
//
// GitHub starts the workflow at two UTC times (one for winter, one for summer time). SCHEDULE is the
// cron line that started this run; the run that doesn't fit Germany's current offset stops at once.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

// Short names for the post: tools/discord-nicknames.json, "title as the post writes it": "nickname".
// Upper/lower case doesn't matter; the key can also be the show's AniList ID ("12345": "nickname").
const NICKNAMES = JSON.parse(readFileSync(new URL('./discord-nicknames.json', import.meta.url), 'utf8'));

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
const webhook = process.env.DISCORD_WEBHOOK || '';

const berlin = (d = new Date()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'shortOffset',
  }).formatToParts(d).map(x => [x.type, x.value]));
  return { ...p, offset: Number(/GMT([+-]\d+)/.exec(p.timeZoneName)?.[1] || 0) };
};

const now = berlin();
const schedule = process.env.SCHEDULE || '';
if (schedule) {
  // "30 7 * * *" starts at 07:30 UTC: right when Germany is UTC+1, i.e. 08:30 there
  const utcHour = Number(schedule.trim().split(/\s+/)[1]);
  if (utcHour + now.offset !== POST_HOUR - 1) {
    console.log(`Cron "${schedule}" is for the other half of the year (Germany is UTC+${now.offset}); nothing to do.`);
    process.exit(0);
  }
}
if (!dryRun && !webhook) {
  console.log('No DISCORD_WEBHOOK secret set; nothing posted.');
  process.exit(0);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ timezoneId: TZ, locale: 'de-DE' });
  page.on('pageerror', e => console.log('page error:', e.message));
  await page.goto(SITE, { waitUntil: 'load', timeout: 60_000 });
  // the page's own globals: everything loaded and this week's schedule drawn
  await page.waitForFunction(() => typeof ready !== 'undefined', null, { timeout: 60_000 });
  await page.evaluate(() => ready);
  await page.waitForFunction(() => lastWeekRender && lastWeekRender[1].getTime() === weekStart(0).getTime(),
    null, { timeout: 180_000, polling: 1000 });

  // a GitHub run can start early: wait for 09:00 so "Heute" and any late moves/delays are right
  const t = berlin();
  const wait = ((POST_HOUR - Number(t.hour)) * 3600 - Number(t.minute) * 60 - Number(t.second)) * 1000;
  if (!dryRun && schedule && wait > 0) {
    console.log(`Waiting ${Math.round(wait / 60000)} min until ${POST_HOUR}:00 German time.`);
    await page.waitForTimeout(wait);
    await page.evaluate(() => loadMoves());
  }

  // same steps as the Discord button's click handler in app.js
  let message = await page.evaluate(nicknames => {
    const nick = Object.fromEntries(Object.entries(nicknames).filter(([k]) => !k.startsWith('_'))
      .map(([k, v]) => [k.trim().toLowerCase(), String(v)]));
    const named = r => {
      const title = r.show.english || r.show.romaji;
      const name = nick[String(r.m?.id)] ?? nick[title.toLowerCase()];
      return name ? { ...r, show: { english: name } } : r;
    };
    const today = isoDay(new Date());
    const found = render(...lastWeekRender, true).find(d => isoDay(d.date) === today);
    if (!found) return null;
    const groups = [];
    for (const r of found.rows.filter(r => !r.pause).map(named)) {
      if (groups.at(-1)?.[0].watchAt === r.watchAt) groups.at(-1).push(r);
      else groups.push([r]);
    }
    return discordMessage({ date: found.date, groups });
  }, NICKNAMES);
  if (!message) throw new Error('Today is missing from the rendered week.');
  const weekday = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, weekday: 'long' }).format(new Date());
  const role = DAY_ROLES[weekday];
  if (role) message = `<@&${role}> ${message}`;
  console.log(message);
  if (dryRun) process.exit(0);

  const res = await fetch(webhook + (webhook.includes('?') ? '&' : '?') + 'wait=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // role pings (e.g. Sophie's) go through, @everyone/@here never
    body: JSON.stringify({ content: message, allowed_mentions: { parse: ['roles', 'users'] } }),
  });
  if (!res.ok) throw new Error(`Discord answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  console.log('Posted to Discord.');
} finally {
  await browser.close();
}
