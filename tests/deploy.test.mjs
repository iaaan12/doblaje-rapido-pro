import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = process.cwd();
const outputDirectory = path.join(root, 'public');

test('build produces the static runtime that Vercel serves', () => {
  rmSync(outputDirectory, { recursive: true, force: true });

  try {
    const result = spawnSync(process.execPath, ['scripts/build-static.mjs'], {
      cwd: root,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);

    for (const file of [
      'index.html',
      'styles.css',
      'compat.css',
      'app/main.mjs',
      'app/gateway.mjs',
      'app/demo-gateway.mjs',
      'app/queue.mjs',
      'app/storage.mjs',
      'app/languages.mjs',
      'app/compat.mjs',
    ]) {
      assert.equal(existsSync(path.join(outputDirectory, file)), true, `Missing public/${file}`);
    }
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
});
