// Nightly copy of the Google Sheet into backup/sheet/: every tab as CSV, plus index.json with the tab list,
// hidden rows and columns (dropped shows, inactive people) and the person colours of the Guckplan tabs.
// The git history of these files is the version history. The Sheet is only read, never written.
// A tab that disappears from the Sheet keeps its last CSV here.
// Usage: node tools/sheet-backup.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const SHEET_ID = '1cbkuLjyLfHpYDor5A1LvIskEOUB9Ij2Nm2TYch62-hQ';
const SHEET = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID;

export const fileName = name => name.normalize('NFC').replace(/[^\p{L}\p{N} ._-]/gu, '_').trim() + '.csv';

export function tabsFromHtml(html) {
  const seen = new Map();
  for (const [, raw, gid] of html.matchAll(/\{name: "((?:[^"\\]|\\.)*)", pageUrl: "[^"]*gid=(\d+)/g)) {
    const name = JSON.parse(`"${raw}"`).trim();
    if (!seen.has(gid)) seen.set(gid, name);
  }
  return [...seen].map(([gid, name]) => ({ name, gid }));
}

const hex = c => '#' + ['red', 'green', 'blue'].map(k => Math.round((c[k] || 0) * 255).toString(16).padStart(2, '0')).join('');

// hidden rows/columns per tab and the header colours of the Guckplan tabs; optional (needs the public API key)
async function sheetMetadata(fetch, key, tabs) {
  if (!key) return {};
  const api = path => fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`)
    .then(r => { if (!r.ok) throw new Error('Sheets-API antwortet ' + r.status); return r.json(); });
  const result = {};
  const hidden = await api('?fields=sheets(properties(sheetId),data(rowMetadata(hiddenByUser),columnMetadata(hiddenByUser)))');
  for (const s of hidden.sheets || []) {
    const data = s.data?.[0] || {};
    const pick = list => (list || []).flatMap((m, i) => m.hiddenByUser ? [i + 1] : []);
    result[String(s.properties.sheetId)] = { hiddenRows: pick(data.rowMetadata), hiddenColumns: pick(data.columnMetadata) };
  }
  const guckplans = tabs.filter(t => /^Guckplan\s/i.test(t.name));
  if (guckplans.length) {
    const ranges = guckplans.map(t => 'ranges=' + encodeURIComponent(`'${t.name.replace(/'/g, "''")}'!A1:AZ6`)).join('&');
    const colors = await api(`?${ranges}&fields=sheets(properties(sheetId),data(rowData(values(formattedValue,effectiveFormat(backgroundColor)))))`);
    for (const s of colors.sheets || []) {
      const header = (s.data?.[0]?.rowData || []).find(r => (r.values || []).some(v => v.formattedValue?.trim() === 'Anime Titel'))?.values || [];
      const people = Object.fromEntries(header.flatMap(v => v.formattedValue?.trim() && v.effectiveFormat?.backgroundColor
        ? [[v.formattedValue.trim(), hex(v.effectiveFormat.backgroundColor)]] : []));
      (result[String(s.properties.sheetId)] ||= {}).colors = people;
    }
  }
  return result;
}

export async function backup({ fetch = globalThis.fetch, dir, key } = {}) {
  const html = await (await fetch(SHEET + '/htmlview')).text();
  const tabs = tabsFromHtml(html);
  if (!tabs.length) throw new Error('Keine Tabs im Sheet gefunden (Link-Freigabe aus?)');
  // download everything first: on any error nothing is overwritten
  const files = [];
  for (const tab of tabs) {
    const res = await fetch(`${SHEET}/export?format=csv&gid=${tab.gid}`);
    if (!res.ok) throw new Error(`Tab „${tab.name}“: Google antwortet ${res.status}`);
    files.push({ tab, file: fileName(tab.name), csv: await res.text() });
  }
  let meta = {};
  try { meta = await sheetMetadata(fetch, key, tabs); }
  catch (e) { console.warn('Ausgeblendete Zeilen und Farben nicht gelesen:', e.message); }
  await mkdir(dir, { recursive: true });
  for (const { file, csv } of files) await writeFile(new URL(file, dir), csv.endsWith('\n') ? csv : csv + '\n');
  const index = { sheet: SHEET, tabs: files.map(({ tab, file }) => ({ name: tab.name, gid: tab.gid, file, ...meta[tab.gid] })) };
  await writeFile(new URL('index.json', dir), JSON.stringify(index, null, 1) + '\n');
  return index;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { sheetsKey } = JSON.parse(await readFile(new URL('../config.json', import.meta.url), 'utf8'));
  const index = await backup({ dir: new URL('../backup/sheet/', import.meta.url), key: sheetsKey });
  console.log(`${index.tabs.length} Tabs gesichert:`, index.tabs.map(t => t.name).join(', '));
}
