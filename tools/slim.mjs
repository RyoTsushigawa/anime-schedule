// What gets published of the page's own code: the same code without its comments, indentation and
// blank lines (the files here keep them). No minifier package needed: a small reader that knows
// strings, template literals and regular expressions, so a "//" inside one of those stays.
// publish.mjs runs the tests a second time on this output (SLIM=1) before uploading anything.

export const SLIMMED = ['index.html', 'planner.html', 'style.css', 'early.js', 'common.js', 'mal.js', 'app.js', 'app-local.js', 'app-accounts.js', 'app-progress.js', 'app-catchup.js', 'app-moves.js', 'app-discord.js', 'app-absence.js', 'app-dayedit.js', 'app-start.js', 'drag-moves.js', 'planner.js'];

export function slim(file, text) {
  if (file.endsWith('.js')) return slimJs(text);
  if (file.endsWith('.css')) return slimCss(text);
  if (file.endsWith('.html')) return slimHtml(text);
  return text;
}

// After these a "/" starts a regular expression, after anything else (a name, a number, ")" or
// "]") it divides.
const REGEX_AFTER = new Set([...'(,=:[!&|?{};+-*%<>~^']);
const REGEX_WORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'throw', 'else', 'do', 'yield', 'await', 'instanceof']);

export function slimJs(src) {
  src = src.replace(/\r\n/g, '\n');
  let out = '';
  let i = 0;
  let last = ''; // the last significant character written in code
  let word = ''; // the last word written in code
  const templates = []; // brace depth at each open ${ … }
  let depth = 0;
  let lineStart = true;
  // Code: newlines kept (they can end statements), but no blank lines, indentation or trailing blanks.
  const newline = () => {
    out = out.replace(/[ \t]+$/, '');
    if (!lineStart) out += '\n';
    lineStart = true;
  };
  const put = s => { out += s; lineStart = false; };
  const isWord = c => /[\w$]/.test(c);

  const template = () => { // from after a backtick (or a closing } of ${ … }) to its end or the next ${
    for (;;) {
      if (i >= src.length) throw new Error('unclosed template literal');
      const c = src[i];
      if (c === '\\') { put(src.slice(i, i + 2)); i += 2; continue; }
      if (c === '`') { put(c); i++; last = '`'; word = ''; return; }
      if (c === '$' && src[i + 1] === '{') { put('${'); i += 2; templates.push(depth); depth++; last = '{'; word = ''; return; }
      put(c); i++;
    }
  };

  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '\n') { newline(); i++; continue; }
    if (c === ' ' || c === '\t') {
      if (!lineStart && !/[ \t]$/.test(out)) put(' ');
      i++; continue;
    }
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) throw new Error('unclosed comment');
      if (src.slice(i, end).includes('\n')) newline(); else if (!lineStart && !/[ \t]$/.test(out)) put(' ');
      i = end + 2; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (src[j] !== c) { if (src[j] === '\\') j++; if (src[j] === '\n' || j >= src.length) throw new Error('unclosed string at ' + i); j++; }
      put(src.slice(i, j + 1)); i = j + 1; last = c; word = ''; continue;
    }
    if (c === '`') { put(c); i++; template(); continue; }
    if (c === '/' && (last === '' || REGEX_AFTER.has(last) || REGEX_WORDS.has(word))) {
      let j = i + 1, inClass = false;
      for (;; j++) {
        if (j >= src.length || src[j] === '\n') throw new Error('unclosed regular expression at ' + i);
        if (src[j] === '\\') { j++; continue; }
        if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) break;
      }
      j++;
      while (isWord(src[j] || '')) j++;
      put(src.slice(i, j)); i = j; last = '/re'; word = ''; continue;
    }
    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (templates.length && templates.at(-1) === depth) { templates.pop(); put('}'); i++; template(); continue; }
    }
    if (isWord(c)) {
      let j = i;
      while (j < src.length && isWord(src[j])) j++;
      word = src.slice(i, j);
      put(word); i = j; last = 'w'; continue;
    }
    put(c); i++; last = c; word = '';
  }
  if (templates.length) throw new Error('unclosed ${ in a template literal');
  return out.replace(/[ \t]+$/, '') + '\n';
}

export function slimCss(src) {
  src = src.replace(/\r\n/g, '\n');
  let out = '';
  for (let i = 0; i < src.length;) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) throw new Error('unclosed comment in CSS');
      i = end + 2; continue;
    }
    if (c === '"' || c === "'") {
      const end = src.indexOf(c, i + 1);
      out += src.slice(i, end + 1); i = end + 1; continue;
    }
    out += c; i++;
  }
  return out.split('\n').map(l => l.trim()).filter(Boolean).join('\n') + '\n';
}

// Comments and indentation only; the scripts are separate files (none inline), and there's no
// <pre> or a <textarea> with text, whose spacing would matter (an empty one is fine).
export function slimHtml(src) {
  src = src.replace(/\r\n/g, '\n');
  if (/<script\b[^>]*>[^<\s]/.test(src) || /<pre\b/.test(src) || /<textarea\b[^>]*>(?!<\/textarea>)/.test(src)) throw new Error('inline script, pre or textarea: slim.mjs would need to handle it');
  return src.replace(/<!--[\s\S]*?-->/g, '').split('\n').map(l => l.trim()).filter(Boolean).join('\n') + '\n';
}
