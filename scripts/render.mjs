import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));

async function main() {
  const { values } = parseArgs({ options: { page: { type: 'string' }, out: { type: 'string' } } });
  const page = resolve(root, values.page ?? 'src/routes/kb/incidents/4471-review/+page.svx');
  const output = resolve(root, values.out ?? 'rendered/4471-review.html');
  let server;
  try {
    server = await createServer({ root, configFile: resolve(root, 'vite.config.mjs'), server: { middlewareMode: true, ws: false }, appType: 'custom' });
    const { default: Page } = await server.ssrLoadModule(page);
    const { render } = await server.ssrLoadModule('svelte/server');
    const { head, body } = render(Page);
    const html = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${head}</head><body>${body}</body></html>\n`;
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, html, 'utf8');
    console.log(`Rendered ${page} to ${output}`);
  } finally {
    await server?.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
