import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
// Independently calculated from the course-issued signature using the original
// desk-ref.ts specification. The ticket itself lives only in the signed page.
const expectedStamp = 'DR-4Q4Z-0TRZ';
const withoutComments = (html) => html.replace(/<!--[\s\S]*?-->/g, '');
const text = (html) => withoutComments(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function independentStamp(signature) {
  const input = signature.trim();
  const hash = (seed) => {
    let value = seed;
    for (let index = 0; index < input.length; index++) {
      value = ((value ^ BigInt(input.charCodeAt(index))) * 16777619n) & 0xffffffffn;
    }
    return value;
  };
  const bits = (hash(2166136261n) << 8n) | (hash(2654435769n) & 255n);
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let encoded = '';
  for (let shift = 35n; shift >= 0n; shift -= 5n) {
    encoded += alphabet[Number((bits >> shift) & 31n)];
  }
  return `DR-${encoded.slice(0, 4)}-${encoded.slice(4)}`;
}

function element(html, tag) {
  const match = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  assert.ok(match, `Missing ${tag} in fresh render`);
  return match[1];
}

test('T7: fresh review SSR presents variant A with computed evidence and a final signed stamp', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'support-kb-page-'));
  try {
    const output = join(directory, 'review.html');
    // Use the production entry point, never the retained build or screenshot.
    const result = spawnSync(process.execPath, [
      'scripts/render.mjs', '--page', 'src/routes/kb/incidents/4471-review/+page.svx', '--out', output,
    ], { cwd: root, encoding: 'utf8', timeout: 45000, windowsHide: true });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const html = readFileSync(output, 'utf8');
    const main = withoutComments(element(html, 'main'));

    await t.test('complete UTF-8 document, runbook metadata and injected component styles', () => {
      assert.match(html, /^<!doctype html>/i);
      assert.match(html, /<html\b[^>]*lang="en"/);
      assert.match(html, /<meta\b[^>]*charset="utf-8"/i);
      assert.doesNotMatch(html, /\uFFFD/, 'UTF-8 text must retain its punctuation');
      assert.equal(text(element(html, 'title')), '#4471 · causes and report split · support kb');
      assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
      assert.equal(text(element(html, 'h1')), '#4471 · causes and report split');
      const header = text(element(html, 'header'));
      assert.match(header, /owner BMachnik/);
      assert.match(header, /\breview\b/);
      // Assert the review date, never the wall-clock-dependent age/staleness.
      assert.match(header, /reviewed 2026-11-10/);
      const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
      assert.match(css, /--bg\s*:/);
      assert.match(css, /max-width:\s*760px/);
      assert.match(css, /prefers-color-scheme:\s*dark/);
      assert.match(css, /\.sum\b[^{}]*\{[^}]*font-size:/);
      assert.match(css, /fill:\s*var\(--warn\)/);
      assert.match(css, /fill:\s*var\(--accent\)/);
      assert.match(css, /\.stamp\b[^{}]*\{[^}]*font:/);
      assert.match(css, /background:\s*var\(--warn-bg\)/);
    });

    await t.test('variant A puts results before actions, uncertainty, timeline and sources', () => {
      const headings = [...main.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => text(m[1]));
      assert.deepEqual(headings, ['What we report', 'Incoming reports and merges', 'Basis of this review']);
      const positions = [
        main.indexOf('<table'), main.indexOf('<h2'), main.indexOf('<aside'),
        main.indexOf('<svg'), main.lastIndexOf('<h2'), main.indexOf('desk ref'),
      ];
      assert.ok(positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1])),
        'Expected CauseTable → actions → warning → QueueTimeline → sources → RenderStamp');
      const warning = text(element(main, 'aside'));
      assert.match(warning, /counted once in the parser group/);
      assert.match(warning, /further investigation/);
      assert.match(warning, /do not establish a timezone defect or another cause/);
    });

    await t.test('CauseTable contains two populated groups and the five-report parser footnote', () => {
      assert.match(text(main), /412 reports merged into #4471 · 2 causes/);
      const table = element(main, 'table');
      const headers = [...element(table, 'thead').matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => text(m[1]));
      assert.deepEqual(headers.slice(0, 5), ['cause', 'reports', 'tagged as', 'tenants', 'seen']);
      const rows = [...element(table, 'tbody').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)]
        .map((row) => [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => text(cell[1])));
      assert.equal(rows.length, 2, 'Footnoted reports must not become a third group');
      assert.deepEqual(rows.map((row) => row.slice(0, 2)).sort(), [['hint', '33'], ['parser', '379']]);
      for (const row of rows) {
        assert.match(row[2], /×\d+/, 'Tags remain populated in the computed table');
        assert.ok(Number(row[3]) > 0, 'Tenant totals remain populated');
        assert.match(row[4], /^2026-\d{2}-\d{2} → 2026-\d{2}-\d{2}$/);
      }
      const footnotes = [...main.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)]
        .map((m) => text(m[1])).filter((value) => value.includes('reports read as a one-day move'));
      assert.deepEqual(footnotes, ['5 reports read as a one-day move; filed under parser by tenant.']);
      assert.ok(main.indexOf('reports read as a one-day move') < main.indexOf('<h2'), 'Footnote accompanies the table');
    });

    await t.test('QueueTimeline renders both data series with an accessible label and textual explanation', () => {
      const figure = element(main, 'figure');
      assert.match(figure, /<svg\b[^>]*role="img"[^>]*aria-label="reports received and merged into #4471, per week"/);
      const bars = [...figure.matchAll(/<rect\b[^>]*>/g)].map((m) => m[0]);
      for (const series of ['in', 'merged']) {
        const values = bars.filter((bar) => new RegExp(`class="${series}(?:\\s|\")`).test(bar))
          .map((bar) => Number(bar.match(/\bheight="([^"]+)"/)?.[1]));
        assert.ok(values.length > 1 && values.every(Number.isFinite), `Missing ${series} series`);
        assert.ok(values.some((value) => value > 0), `${series} series must contain real data`);
      }
      assert.match(text(element(figure, 'figcaption')), /received · merged into #4471 · per week/);
      const content = text(main);
      assert.match(content, /received series.*receivedAt.*merged series.*mergedAt/);
      assert.match(content, /not evidence of a matching spike in new arrivals/);
    });

    await t.test('RenderStamp matches the independent course-signature baseline and ends main before the runbook footer', () => {
      const source = readFileSync(join(root, 'src/routes/kb/incidents/4471-review/+page.svx'), 'utf8');
      const signature = source.match(/^signature:\s*([^\r\n]+)$/m)?.[1];
      assert.ok(signature, 'The page must declare its course-issued signature');
      assert.ok(independentStamp(signature) === expectedStamp,
        'The signed source must match the independently pinned course-ticket baseline');
      assert.match(main, new RegExp(String.raw`<p\b[^>]*>\s*desk ref\s*<b\b[^>]*>${expectedStamp}<\/b>\s*<\/p>\s*$`));
      assert.equal((text(main).match(new RegExp(`desk ref ${expectedStamp}`, 'g')) ?? []).length, 1);
      assert.ok(html.indexOf('</main>') < html.indexOf('<footer'));
      assert.equal(text(element(html, 'footer')), 'Pages are written by people. Tables and charts are built from data at render time.');
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
