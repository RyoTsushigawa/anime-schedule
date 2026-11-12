// The check for every pull request (.github/workflows/check.yml): loads the live site with this
// checkout's page files in a headless browser and fails when something is broken.
//
//   node tools/check-site.mjs            checks; exit code 1 on a failure
//   SCREENS=dir node tools/check-site.mjs   also saves screenshots there (desktop and phone)
//
// The data (Guckplan sheet, AniList, streams, moves) is the live one; only .html, .css and .js files
// that exist in this checkout replace the published ones. Nothing is saved or posted: every request
// that would write (GitHub API, the Cloudflare helper) is cut off.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const SITE = 'https://ryotsushigawa.github.io/anime-schedule/';
const shots = process.env.SCREENS || '';
if (shots) mkdirSync(shots, { recursive: true });
const failures = [], warnings = [];
const fail = text => { failures.push(text); console.log('FAIL  ' + text); };
const warn = text => { warnings.push(text); console.log('warn  ' + text); };
const ok = text => console.log('ok    ' + text);

// 1. every script parses
for (const file of [...readdirSync('.').filter(f => f.endsWith('.js')), ...readdirSync('tools').filter(f => /\.m?js$/.test(f)).map(f => 'tools/' + f)]) {
  const run = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (run.status !== 0) fail(`${file} does not parse: ${run.stderr.split('\n').slice(0, 4).join(' ')}`);
}
// ... and the stylesheets have matching braces (a stray "}" silently drops the rule after it)
for (const file of readdirSync('.').filter(f => f.endsWith('.css'))) {
  let depth = 0, broken = false;
  for (const ch of readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (ch === '{') depth++;
    else if (ch === '}' && --depth < 0) { broken = true; break; }
  }
  if (broken || depth) fail(`${file} has unbalanced braces`);
}
if (!failures.length) ok('all scripts parse, stylesheets are balanced');

const browser = await chromium.launch();
async function open(viewport, init = {}) {
  const ctx = await browser.newContext({ viewport, timezoneId: 'Europe/Berlin', locale: 'de-DE', colorScheme: 'dark', serviceWorkers: 'block', bypassCSP: true });
  await ctx.addInitScript(values => { for (const [k, v] of Object.entries(values)) localStorage.setItem(k, v); }, { notesSeen: '9999', ...init });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/api\.github\.com|workers\.dev/, r => r.request().method() === 'GET' ? r.continue() : r.abort());
  await page.route(u => u.href.startsWith(SITE), r => {
    const file = new URL(r.request().url()).pathname.replace('/anime-schedule/', '') || 'index.html';
    const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : '';
    return type && existsSync(file) ? r.fulfill({ path: file, contentType: type }) : r.continue();
  });
  await page.goto(SITE, { waitUntil: 'load', timeout: 60_000 });
  const loaded = await page.waitForFunction(() => document.querySelector('#list .row'), null, { timeout: 120_000 }).then(() => true, () => false);
  await page.waitForTimeout(4000);
  return { ctx, page, errors, loaded };
}
const shot = (page, name) => shots ? page.screenshot({ path: `${shots}/${name}.png` }).catch(() => {}) : null;
const click = async (page, selector, wait = 600) => { try { await page.click(selector, { timeout: 5000 }); await page.waitForTimeout(wait); return true; } catch { return false; } };

// 2. desktop: the week loads, the views and dialogs open, the Discord text builds
{
  const { ctx, page, errors, loaded } = await open({ width: 1440, height: 900 }, { movesKey: 'check', who: '1', mode: 'group' });
  if (!loaded) fail('the schedule did not load within two minutes (a page error, or a data source is down: run the check again)');
  else {
    ok('the week loads');
    await shot(page, 'desktop-week');
    const week = await page.evaluate(async () => {
      await nicknamesReady;
      return [0, 1, 2, 3, 4, 5, 6].map(i => { const d = new Date(lastWeekRender[1]); d.setDate(d.getDate() + i); const day = discordDay(isoDay(d)); return day ? discordMessage(day) : null; });
    }).catch(e => { fail('the Discord message does not build: ' + e.message); return null; });
    if (week) {
      if (week.some(m => typeof m !== 'string' || !/(stehen an:|steht nichts an\.)/.test(m))) fail('a day of the week has no proper Discord message');
      else ok('the Discord message builds for all seven days');
    }
    for (const [name, steps] of [
      ['settings', ['#settingsButton']], ['help', ['#settingsButton', '#settingsMenu .settings-secondary > details:last-child > summary', '#helpButton']], ['absences', ['#miscButton', '#awayButton']],
      ['tools', ['#miscButton']], ['edit mode', ['#editSchedule']], ['move dialog', ['#list .move:visible']],
    ]) {
      let done = true;
      for (const s of steps) done = await click(page, s) && done;
      if (!done) fail(`"${name}" does not open`);
      await shot(page, 'desktop-' + name.replace(/ /g, '-'));
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      if (name === 'edit mode') continue; // stays on for the move dialog
    }
    for (const [name, button] of [['Catch-up', '#viewCatchup'], ['Non-seasonal', '#viewPace'], ['Zeitplan', '#viewWeek']]) {
      if (!await click(page, button, 2500)) fail(`the view "${name}" does not open`);
    }
    await page.keyboard.press('/'); await page.keyboard.type('a'); await page.waitForTimeout(800);
    if (!await page.evaluate(() => !!document.getElementById('matchCount') || !!document.getElementById('noMatch'))) fail('searching shows neither hits nor "no match"');
    if (!failures.length) ok('views, dialogs and search work');
  }
  for (const e of new Set(errors)) fail('page error (desktop): ' + e);
  await ctx.close();
}

// 3. phone: nothing may run off the side (a warning only: phones are not the priority)
{
  const { ctx, page, errors, loaded } = await open({ width: 390, height: 844 }, { movesKey: 'check', who: '1' });
  if (loaded) {
    const wide = async label => {
      const over = await page.evaluate(() => { const d = document.documentElement; return d.scrollWidth - d.clientWidth; });
      if (over > 1) warn(`phone, ${label}: the page is ${over}px wider than the screen`);
    };
    await wide('week'); await shot(page, 'phone-week');
    if (await click(page, '#editSchedule')) { await wide('edit mode'); await shot(page, 'phone-edit'); await click(page, '#editSchedule'); }
    for (const [label, sel] of [['absences', '#awayButton'], ['settings', '#settingsButton'], ['tools', '#miscButton']]) {
      if (label === 'absences') await click(page, '#miscButton', 200);
      if (await click(page, sel)) { await wide(label); await shot(page, 'phone-' + label); await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
    }
    if (await click(page, '#viewCatchup', 2500)) { await wide('Catch-up'); await shot(page, 'phone-catchup'); }
  }
  for (const e of new Set(errors)) fail('page error (phone): ' + e);
  await ctx.close();
}
await browser.close();

console.log(failures.length ? `\n${failures.length} problem(s) found.` : `\nAll checks passed${warnings.length ? ` (${warnings.length} warning(s))` : ''}.`);
process.exit(failures.length ? 1 : 0);
