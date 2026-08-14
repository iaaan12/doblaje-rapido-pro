import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceFiles = ['index.html', 'styles.css', 'compat.css'];
const sourceDirectories = ['app'];

export async function buildStatic({
  sourceRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url))),
  outputRoot = path.join(sourceRoot, 'public'),
} = {}) {
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });

  await Promise.all(
    sourceFiles.map((file) => cp(path.join(sourceRoot, file), path.join(outputRoot, file))),
  );

  await Promise.all(
    sourceDirectories.map((directory) =>
      cp(path.join(sourceRoot, directory), path.join(outputRoot, directory), { recursive: true }),
    ),
  );

  return outputRoot;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputRoot = await buildStatic();
  console.log(`Static runtime copied to ${path.relative(process.cwd(), outputRoot) || '.'}/`);
}
