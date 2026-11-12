import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APP_SOURCE } from './app-source.mjs';

const app = APP_SOURCE;
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

test('busy Catch-up seasons display eight rows initially but keep the others expandable', () => {
  assert.match(app, /const visible = listed\.slice\(0, 8\), remaining = listed\.slice\(8\)/);
  assert.match(app, /remaining\.length && !selecting \? `<details class="catchup-overflow"/);
  assert.match(app, /remaining\.map\(show\)\.join\(''\)/);
  assert.match(css, /\.catchup-overflow > summary:focus-visible/);
});

test('search opens collapsed Catch-up sections and clears search-opened state', () => {
  assert.match(app, /details\.catchup-overflow:not\(\[open\]\)/);
  assert.match(app, /details\.catchup-season:not\(\[open\]\)/);
  assert.match(app, /delete fold\.dataset\.searchOpened/);
});

test('bulk-select mode displays the complete listed season', () => {
  assert.match(app, /remaining\.length && !selecting/);
  assert.match(app, /: remaining\.map\(show\)\.join\(''\)/);
});
