// The main page's code as one text (app.js and its app-*.js parts, in index.html's order), for tests
// that look into the source. No dependencies, so it also works without installing the test packages.
import { readFileSync } from 'node:fs';
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
export const APP_FILES = [...read('index.html').matchAll(/<script\b[^>]*\bsrc="(app(?:-[\w-]+)?\.js)"/g)].map(m => m[1]);
export const APP_SOURCE = APP_FILES.map(read).join('');
