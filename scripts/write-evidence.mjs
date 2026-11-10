import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const page = 'src/routes/kb/incidents/4471-review/+page.svx';
const html = 'rendered/4471-review.html';

async function dataFiles(directory) {
  const entries = await readdir(resolve(root, directory), { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? dataFiles(path) : [path];
  }));
  return files.flat().sort();
}

async function main() {
  const files = [page, 'delivery/issues.json', 'src/lib/kb/causes.ts', 'src/lib/kb/locales.ts',
    ...await dataFiles('src/lib/data'), html];
  const sha256 = {};
  for (const path of files) {
    sha256[path] = createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');
  }
  const evidence = {
    recordedAt: new Date().toISOString(),
    renderedAt: (await stat(resolve(root, html))).mtime.toISOString(),
    page,
    html,
    sha256,
    browserReview: { status: 'pending', note: 'Browser checks and screenshot must be recorded by Alfred after inspecting this render.' },
  };
  await writeFile(resolve(root, 'delivery/evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log('Recorded render time and SHA-256 hashes in delivery/evidence.json; browser review remains pending.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
