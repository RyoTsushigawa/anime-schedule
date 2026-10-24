// A small .xlsx writer (one sheet), enough for the planner's Guckplan export: text and number
// cells, a header row (bold white on dark grey, or a column's own colour), links, hidden rows,
// column widths and a frozen header. An .xlsx is a zip of a few XML parts; they're stored without
// compression, so no library is needed. Google Sheets imports it as a tab (File → Import).
//
// xlsxBlob({ name, widths: [number | { width, hidden }], headerRow, header: [{ text, fill: '#rrggbb'? }],
//            rows: [{ hidden?, cells: [string | number | { text, link }] }] }) → Blob

function xlsxBlob({ name, widths, headerRow, header, rows }) {
  const x = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const col = i => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
  const argb = hex => 'FF' + hex.slice(1).toUpperCase();
  const light = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); return 0.299 * r + 0.587 * g + 0.114 * b > 150; };

  // Styles: 0 plain, 1 header, 2 link, then one per header colour (dark or light text on it).
  const fills = [...new Set(header.map(h => h.fill).filter(f => /^#[0-9a-f]{6}$/i.test(f || '')))];
  const headerStyle = h => !h.text ? 0 : fills.includes(h.fill) ? 3 + fills.indexOf(h.fill) : 1;
  const cell = (ref, v, style) => {
    if (v === '' || v === null || v === undefined) return '';
    const s = style ? ` s="${style}"` : '';
    return typeof v === 'number' ? `<c r="${ref}"${s}><v>${v}</v></c>`
      : `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${x(v)}</t></is></c>`;
  };
  const links = [];
  let data = `<row r="${headerRow}">${header.map((h, i) => cell(`${col(i)}${headerRow}`, h.text, headerStyle(h))).join('')}</row>`;
  rows.forEach((row, j) => {
    const r = headerRow + 1 + j;
    data += `<row r="${r}"${row.hidden ? ' hidden="1"' : ''}>` + row.cells.map((v, i) => {
      const ref = `${col(i)}${r}`;
      if (v && typeof v === 'object') {
        if (v.link) links.push({ ref, url: v.link });
        return cell(ref, v.text, v.link ? 2 : 0);
      }
      return cell(ref, v, 0);
    }).join('') + '</row>';
  });

  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const pkg = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const sheet = head + `<worksheet xmlns="${main}" xmlns:r="${rel}">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w.width ?? w}" customWidth="1"${w.hidden ? ' hidden="1"' : ''}/>`).join('')}</cols>` +
    `<sheetData>${data}</sheetData>` +
    (links.length ? `<hyperlinks>${links.map((l, i) => `<hyperlink ref="${l.ref}" r:id="rId${i + 1}"/>`).join('')}</hyperlinks>` : '') +
    '</worksheet>';
  const font = (extra = '') => `<font>${extra}<sz val="10"/><name val="Arial"/></font>`;
  const solid = rgb => `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
  const xf = (fontId, fillId) => `<xf numFmtId="0" fontId="${fontId}" fillId="${fillId}" borderId="0" xfId="0" applyFont="1" applyFill="1"/>`;
  const styles = head + `<styleSheet xmlns="${main}">` +
    `<fonts count="4">${font()}${font('<b/><color rgb="FF111111"/>')}${font('<b/><color rgb="FFFFFFFF"/>')}${font('<u/><color rgb="FF1155CC"/>')}</fonts>` +
    `<fills count="${3 + fills.length}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${solid('FF434343')}${fills.map(f => solid(argb(f))).join('')}</fills>` +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${3 + fills.length}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>${xf(2, 2)}${xf(3, 0)}${fills.map((f, i) => xf(light(f) ? 1 : 2, 3 + i)).join('')}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const sheetName = x(name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31));
  const files = {
    '[Content_Types].xml': head + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels': head + `<Relationships xmlns="${pkg}"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': head + `<workbook xmlns="${main}" xmlns:r="${rel}"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': head + `<Relationships xmlns="${pkg}"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="${rel}/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': styles,
    'xl/worksheets/sheet1.xml': sheet,
  };
  if (links.length) files['xl/worksheets/_rels/sheet1.xml.rels'] = head + `<Relationships xmlns="${pkg}">` +
    links.map((l, i) => `<Relationship Id="rId${i + 1}" Type="${rel}/hyperlink" Target="${x(l.url)}" TargetMode="External"/>`).join('') + '</Relationships>';
  return new Blob([zipStored(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// A zip archive with the files stored as they are (no compression): { name: text } → bytes.
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function zipStored(files) {
  const enc = new TextEncoder();
  const crc32 = bytes => { let c = 0xFFFFFFFF; for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const date = ((new Date().getFullYear() - 1980) << 9) | ((new Date().getMonth() + 1) << 5) | new Date().getDate();
  const local = [], central = [];
  let offset = 0;
  for (const [path, text] of Object.entries(files)) {
    const name = enc.encode(path), body = enc.encode(text), crc = crc32(body);
    const header = (size, sig) => {
      const v = new DataView(new ArrayBuffer(size));
      v.setUint32(0, sig, true);
      return v;
    };
    const l = header(30, 0x04034b50);
    l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true); l.setUint16(8, 0, true); l.setUint16(12, date, true);
    l.setUint32(14, crc, true); l.setUint32(18, body.length, true); l.setUint32(22, body.length, true); l.setUint16(26, name.length, true);
    local.push(new Uint8Array(l.buffer), name, body);
    const c = header(46, 0x02014b50);
    c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(14, date, true);
    c.setUint32(16, crc, true); c.setUint32(20, body.length, true); c.setUint32(24, body.length, true); c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const size = central.reduce((s, a) => s + a.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true); end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, size, true); end.setUint32(16, offset, true);
  const parts = [...local, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((s, a) => s + a.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
