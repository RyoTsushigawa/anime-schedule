// Every morning at 09:00 German time: posts today's schedule to Discord, exactly as the Discord
// button on a day heading writes it. The page itself builds the message (Guckplan, AniList, moves,
// delays), so this opens the live site in a headless browser instead of copying its logic.
//
//   node tools/discord-daily.mjs            posts now to the webhook in DISCORD_WEBHOOK
//   node tools/discord-daily.mjs --dry-run  only prints the message
//
// The Cloudflare helper starts the workflow at 08:50 German time (WAIT_FOR_NINE=true); the run then
// waits for 09:00. GitHub's own timer was too unreliable (hours late, or not at all).
import { chromium } from 'playwright';

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

const waitForNine = process.env.WAIT_FOR_NINE === 'true';
if (!dryRun && !webhook) {
  console.log('No DISCORD_WEBHOOK secret set; nothing posted.');
  process.exit(0);
}

const browser = await chromium.launch();
try {
  // bypassCSP: the page's security rules forbid code from outside, which would block the checks below
  const page = await browser.newPage({ timezoneId: TZ, locale: 'de-DE', bypassCSP: true });
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
  if (!dryRun && waitForNine && wait > 0) {
    console.log(`Waiting ${Math.round(wait / 60000)} min until ${POST_HOUR}:00 German time.`);
    await page.waitForTimeout(wait);
    await page.evaluate(() => Promise.all([loadMoves(),
      fetch('nicknames.json', { cache: 'no-cache' }).then(r => r.json()).then(j => { nicknames = cleanNicknames(j.names); emotes = cleanEmotes(j.emotes); }).catch(() => {})]));
  }

  // same steps as the Discord button in app.js, nicknames (nicknames.json) included
  let message = await page.evaluate(async () => {
    await nicknamesReady;
    const day = discordDay(isoDay(new Date()));
    return day && discordMessage(day);
  });
  if (!message) throw new Error('Today is missing from the rendered week.');
  const weekday = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, weekday: 'long' }).format(new Date());
  const role = DAY_ROLES[weekday];
  if (role) message = `<@&${role}>\n\n${message}`;
  console.log(message);
  if (dryRun) {
    // the rest of the week too, as the Discord button would write it, to check the run reads the plan
    const week = await page.evaluate(() => [0, 1, 2, 3, 4, 5, 6].map(i => {
      const d = new Date(lastWeekRender[1]); d.setDate(d.getDate() + i);
      const day = discordDay(isoDay(d));
      return day ? `--- ${isoDay(d)} ---\n${discordMessage(day)}` : `--- ${isoDay(d)}: missing ---`;
    }));
    console.log('\nThis week (dry run only):\n' + week.join('\n'));
    process.exit(0);
  }

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
