import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../app/main.mjs', import.meta.url), 'utf8');

test('source language defaults to automatic detection', () => {
  assert.match(
    index,
    /<select id="sourceLang">\s*<option value="" selected>Auto-detectar<\/option>/,
  );
});

test('Dubbing Studio is an explicit opt-in', () => {
  assert.match(index, /<input id="dubbingStudio" type="checkbox">/);
  assert.doesNotMatch(index, /<input id="dubbingStudio"[^>]*checked/);
});

test('the upload limit shown for legacy v1 is one GiB', () => {
  assert.match(index, /hasta 1 GB/);
});

test('the form rejects an explicit source language selected as a target', () => {
  assert.match(main, /targets\.includes\(\$\('#sourceLang'\)\.value\)/);
  assert.match(main, /idiomas de origen y destino deben ser distintos/i);
});
