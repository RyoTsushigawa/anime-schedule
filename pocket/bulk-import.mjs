// Mobile-friendly bulk entry: one card per line, or set-number ranges.
// Examples: A1-1 2, A1-2=3, A1-1..A1-100, A1: 1-100.
export function parseBulkCards(text, validIds) {
  if (typeof text !== 'string' || text.length > 200000) throw Error('Input too large');
  const canonical = new Map([...validIds].map(id => [id.toUpperCase(), id]));
  const owned = new Map(), unknown = [], invalid = [];
  const lines = text.replace(/\r/g, '').split('\n');
  if (lines.length > 5000) throw Error('Too many lines');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    let ids = [], qty = 1;
    let m = /^([a-z0-9]+(?:-[a-z0-9]+)?)-(\d+)\s*(?:\.\.|\s+to\s+)(?:\1-)?(\d+)\s*(?:[x= ]\s*(\d+))?$/i.exec(line);
    if (m) {
      const start = +m[2], end = +m[3]; qty = m[4] === undefined ? 1 : +m[4];
      if (end < start || end - start > 999) { invalid.push(i + 1); continue; }
      ids = Array.from({length:end-start+1}, (_, j) => m[1] + '-' + (start+j));
    } else {
      m = /^([a-z0-9]+(?:-[a-z0-9]+)?):\s*(\d+)\s*-\s*(\d+)\s*(?:[x= ]\s*(\d+))?$/i.exec(line);
      if (m) {
        const start = +m[2], end = +m[3]; qty = m[4] === undefined ? 1 : +m[4];
        if (end < start || end - start > 999) { invalid.push(i + 1); continue; }
        ids = Array.from({length:end-start+1}, (_, j) => m[1] + '-' + (start+j));
      } else {
        m = /^([a-z0-9]+(?:-[a-z0-9]+)?-\d+)\s*(?:[,;:=x×]\s*|\s+)(\d+)$|^([a-z0-9]+(?:-[a-z0-9]+)?-\d+)$/i.exec(line);
        if (!m) { invalid.push(i + 1); continue; }
        ids = [m[1] || m[3]]; qty = m[2] === undefined ? 1 : +m[2];
      }
    }
    if (!Number.isInteger(qty) || qty < 0 || qty > 99) { invalid.push(i + 1); continue; }
    for (const raw of ids) {
      const parts = /^(.*)-(\d+)$/.exec(raw);
      const key = (parts[1] + '-' + Number(parts[2])).toUpperCase();
      const id = canonical.get(key);
      if (!id) { unknown.push(raw); continue; }
      if (owned.has(id)) { invalid.push(i + 1); continue; }
      owned.set(id, qty);
    }
  }
  return { owned, unknown, invalid, total: lines.length };
}
