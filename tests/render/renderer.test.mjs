import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const text = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function withRender(page, inspect, nodeArgs = []) {
  assert.ok(existsSync(join(root, 'scripts/render.mjs')), 'Missing SSR runner scripts/render.mjs');
  const directory = mkdtempSync(join(tmpdir(), 'support-kb-render-'));
  const output = join(directory, 'fresh.html');
  try {
    // Finite timeout is a leak guard, never a timing assertion about render speed.
    const result = spawnSync(process.execPath, [...nodeArgs, 'scripts/render.mjs', '--page', page, '--out', output], {
      cwd: root, encoding: 'utf8', timeout: 45000, windowsHide: true,
    });
    assert.ifError(result.error);
    inspect(result, output);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function successfulHtml(result, output) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.ok(existsSync(output), 'SSR must write the requested fresh output');
  const html = readFileSync(output, 'utf8');
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<html\b[^>]*\blang=["'][^"']+["']/i);
  assert.match(html, /<meta\b[^>]*charset=["']?utf-8/i);
  assert.match(html, /<head\b[\s\S]*<title>[\s\S]*<\/head>/i);
  assert.match(html, /<body\b[\s\S]*<\/body>/i);
  assert.match(html, /<style\b[^>]*>[\s\S]*--bg\s*:/i);
  assert.match(html, /prefers-color-scheme:\s*dark/);
  assert.match(html, /<main\b/);
  assert.match(text(html), /Pages are written by people\. Tables and charts are built from data at render time\./);
  return html;
}

test('T6: all original library files and existing KB pages retain their export bytes', () => {
  const hashes = JSON.parse(readFileSync(new URL('../fixtures/render/original-sha256.json', import.meta.url), 'utf8'));
  assert.ok(Object.keys(hashes).length > 20, 'Baseline covers the original library, data and pages');
  for (const [path, expected] of Object.entries(hashes)) {
    assert.equal(createHash('sha256').update(readFileSync(join(root, path))).digest('hex'), expected, path);
  }
});

for (const [scenario, page] of [
  ['success', 'src/routes/kb/incidents/4471-review/+page.svx'],
  ['broken-import', 'tests/fixtures/render/broken-import.svx'],
]) {
  test(`security: SSR makes no net.Server.listen attempt (${scenario})`, () => {
    withRender(page, (result, output) => {
      const diagnostic = result.stderr + result.stdout;
      assert.match(diagnostic, /SSR_LISTEN_PROBE_READY/, 'The preload probe must run in the SSR process');
      if (scenario === 'success') {
        successfulHtml(result, output);
      } else {
        assert.notEqual(result.status, 0);
        assert.match(diagnostic, /DeliberatelyMissingForT8/);
        assert.equal(existsSync(output), false);
      }
      assert.doesNotMatch(diagnostic, /SSR_LISTEN_ATTEMPT/, 'One-shot SSR must never attempt to open a network listener');
    }, ['--import', './tests/fixtures/render/listen-probe.mjs']);
  });
}

test('T6: original incident renders frontmatter, layout, real tables, timeline and injected CSS', () => {
  withRender('src/routes/kb/incidents/4471/+page.svx', (result, output) => {
    const html = successfulHtml(result, output);
    assert.match(html, /<title>#4471 · dates parse mm\/dd in eu locales · support kb<\/title>/);
    const content = text(html);
    assert.match(content, /owner support desk/);
    assert.match(content, /reviewed 2026-09-30/);
    assert.match(content, /412 reports merged into #4471 · 2 causes/);
    assert.match(content, /parser 379/);
    assert.match(content, /hint 33/);
    assert.match(content, /5 reports read as a one-day move; filed under parser by tenant\./);
    assert.match(html, /<svg\b[^>]*aria-label="reports received and merged into #4471, per week"/);
    assert.match(html, /<rect\b[^>]*class="in(?:\s|\")/);
    assert.match(html, /<rect\b[^>]*class="merged(?:\s|\")/);
    assert.match(html, /fill:\s*var\(--warn\)/);
  });
});

test('T6: new review skeleton renders with owner and a computed signature', () => {
  withRender('src/routes/kb/incidents/4471-review/+page.svx', (result, output) => {
    const html = successfulHtml(result, output);
    assert.match(text(html), /owner BMachnik/);
    assert.match(text(html), /desk ref DR-HSVT-4XQA/);
    const source = readFileSync(join(root, 'src/routes/kb/incidents/4471-review/+page.svx'), 'utf8');
    assert.doesNotMatch(source, /DR-HSVT-4XQA/, 'The page must derive its ref through RenderStamp');
  });
});

test('T8: a broken import fails, exits without leaked resources and writes no successful result', () => {
  withRender('tests/fixtures/render/broken-import.svx', (result, output) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /DeliberatelyMissingForT8/);
    assert.equal(existsSync(output), false);
  });
});

test('T8: unsigned fixture retains the original missing-signature warning', () => {
  withRender('tests/fixtures/render/unsigned.svx', (result, output) => {
    const html = successfulHtml(result, output);
    assert.match(text(html), /no desk ref: this page isn't signed \(no signature in its frontmatter\)/);
    assert.doesNotMatch(text(html), /DR-[0-9A-Z]{4}-[0-9A-Z]{4}/);
  });
});

test('T8: nonexistent ticket renders zero reports, zero causes and no data rows', () => {
  withRender('tests/fixtures/render/empty-ticket.svx', (result, output) => {
    const html = successfulHtml(result, output);
    assert.match(text(html), /0 reports merged into #999999 · 0 causes/);
    const tbody = html.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i);
    assert.ok(tbody, 'Original CauseTable includes its table body');
    assert.doesNotMatch(tbody[1], /<tr\b/i);
    assert.doesNotMatch(text(html), /reports read as a one-day move/);
  });
});
