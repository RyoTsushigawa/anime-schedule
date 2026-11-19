// Pokémon Zone Exporter CSV parser. No credentials, network calls or account access.
export function parseZoneCsv(text, validIds) {
  if (typeof text !== 'string' || text.length > 3000000) throw Error('CSV too large');
  const rows = []; let row = [], field = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && !field) quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); if (row.some(v => v.trim())) rows.push(row);
      row = []; field = '';
    } else field += c;
  }
  if (quoted) throw Error('Unclosed CSV quote');
  row.push(field); if (row.some(v => v.trim())) rows.push(row);
  if (rows.length < 2 || rows.length > 12000) throw Error('Empty or oversized CSV');
  const head = rows.shift().map(s => s.trim().toLowerCase());
  const idCol = head.indexOf('id'), qtyCol = head.indexOf('numberowned');
  if (idCol < 0 || qtyCol < 0) throw Error('Expected Pokémon Zone Exporter columns: Id, NumberOwned');
  const owned = new Map(), unknown = [], invalid = [], seen = new Set();
  const canonical = new Map([...validIds].map(id => [id.toUpperCase(), id]));
  for (const [i, cells] of rows.entries()) {
    const raw = (cells[idCol] || '').trim(), quantity = (cells[qtyCol] || '').trim();
    if (!raw && !quantity) continue;
    const m = /^([a-z0-9]+(?:-[a-z0-9]+)?)-(\d{1,4})$/i.exec(raw);
    const id = m ? m[1].toUpperCase() + '-' + Number(m[2]) : '';
    if (!id || !/^\d+$/.test(quantity) || Number(quantity) > 99) { invalid.push(i + 2); continue; }
    const actual = canonical.get(id.toUpperCase());
    if (!actual) { unknown.push(id); continue; }
    if (seen.has(actual)) { invalid.push(i + 2); continue; }
    seen.add(actual); owned.set(actual, Number(quantity));
  }
  return { owned, unknown, invalid, total: rows.length };
}
export function previewZoneImport(current, imported, replace = false) {
  const changes = [];
  const keys = replace ? new Set([...Object.keys(current), ...imported.keys()]) : new Set(imported.keys());
  for (const id of keys) {
    const before = current[id] || 0, after = imported.get(id) || 0;
    if (before !== after) changes.push({ id, before, after });
  }
  return changes.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}
