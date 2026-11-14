import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import * as acorn from 'acorn';
// Classic scripts on a page share one global scope: a top-level let/const/class with the same name in two of
// them stops the second script ("Identifier 'x' has already been declared"), the whole page breaks.
// (It happened: common.js got a groupCode() and the Season Preview has its own groupCode variable.)
const root = new URL('../', import.meta.url);
const read = f => readFileSync(new URL(f, root), 'utf8');
function topNames(src) {
  const out = [];
  for (const node of acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true }).body) {
    if (node.type === 'VariableDeclaration') for (const d of node.declarations) {
      const collect = p => p.type === 'Identifier' ? out.push([p.name, node.kind === 'var' ? 'var' : 'lexical'])
        : p.type === 'ObjectPattern' ? p.properties.forEach(q => collect(q.value || q.argument))
        : p.type === 'ArrayPattern' ? p.elements.filter(Boolean).forEach(collect)
        : p.type === 'RestElement' ? collect(p.argument) : p.type === 'AssignmentPattern' ? collect(p.left) : null;
      collect(d.id);
    }
    else if (node.type === 'FunctionDeclaration') out.push([node.id.name, 'function']);
    else if (node.type === 'ClassDeclaration') out.push([node.id.name, 'lexical']);
  }
  return out;
}
for (const page of readdirSync(root).filter(f => f.endsWith('.html'))) {
  test(`${page}: no top-level name declared twice across its classic scripts`, () => {
    const scripts = [...read(page).matchAll(/<script(?![^>]*type="module")[^>]*src="([^"?]+)(?:\?[^"]*)?"/g)].map(m => m[1]).filter(f => existsSync(new URL(f, root)));
    const seen = new Map(), clashes = [];
    for (const file of scripts) for (const [name, kind] of topNames(read(file))) {
      const before = seen.get(name);
      if (before && before.file !== file && (kind === 'lexical' || before.kind === 'lexical')) clashes.push(`${name}: ${before.file} and ${file}`);
      if (!before) seen.set(name, { file, kind });
    }
    assert.deepEqual(clashes, []);
  });
}
