import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { causeOf, groupByCause, readAs, sameCause, uniqueById } from '../../src/lib/kb/causes.ts';
import { DEDUPE_CASES } from '../../src/lib/kb/dedupe-cases.ts';

const json = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const reports = await json('../../src/lib/data/reports-4471.json');
const notes = await json('../../src/lib/data/desk-notes.json');
const tenants = new Map(await Promise.all(
  (await readdir(new URL('../../src/lib/data/tenants/', import.meta.url)))
    .filter((name) => name.endsWith('.json'))
    .map(async (name) => {
      const tenant = await json(`../../src/lib/data/tenants/${name}`);
      return [tenant.handle, tenant];
    }),
));
const unique = uniqueById(reports);
const selected = unique.filter((report) => report.mergedInto === 4471);
const groups = groupByCause(selected, (report) => tenants.get(report.tenant));
const noteIds = ['R-41202', 'R-41209', 'R-41236', 'R-41344', 'R-41620'];
const sorted = (items) => [...items].sort();

async function runAnalysis() {
  const runner = new URL('../../scripts/analyze.mjs', import.meta.url);
  // An explicit behavior assertion keeps a missing runner distinct from syntax/import errors.
  await assert.doesNotReject(() => readFile(runner), 'TDD: scripts/analyze.mjs must provide the new local analysis runner');
  const module = await import(runner.href);
  assert.equal(typeof module.analyze, 'function', 'analyze.mjs must export analyze()');
  return module.analyze();
}

test('T1 characterization: overlapping export pages contain 15 identical repeated rows', () => {
  assert.equal(reports.length, 427);
  assert.equal(unique.length, 412);
  const seen = new Map();
  let duplicates = 0;
  for (const report of reports) {
    if (seen.has(report.id)) {
      assert.deepEqual(report, seen.get(report.id), `duplicate ${report.id} must be identical`);
      duplicates++;
    }
    seen.set(report.id, report);
  }
  assert.equal(duplicates, 15);
  assert.equal(selected.length, 412);
  assert.deepEqual(groups.map((group) => [group.cause, group.reports.length]), [['parser', 379], ['hint', 33]]);
  assert.equal(new Set(groups.flatMap((group) => group.reports.map((report) => report.id))).size, 412);
});

test('T1 characterization: uniqueById handles empty, repeated and distinct IDs without subject dedupe', () => {
  assert.deepEqual(uniqueById([]), []);
  const first = { ...reports[0], id: 'A', subject: 'Same subject' };
  const second = { ...first, id: 'B' };
  assert.deepEqual(uniqueById([first, first, second, first]), [first, second]);
  assert.deepEqual(uniqueById([first, second]), [first, second]);
});

test('T2 characterization: tenant locale, form and channel determine cause independently of intake metadata', () => {
  const tenant = { handle: 'fixture', name: 'Fixture', locale: 'en-GB', form: 'booking-v3' };
  const cases = [
    ['form', tenant, 'hint'],
    ['app', tenant, 'parser'],
    ['email', tenant, 'parser'],
    ['form', { ...tenant, form: 'booking-v2' }, 'parser'],
    ['form', { ...tenant, locale: 'en-US' }, null],
    ['form', undefined, null],
  ];
  for (const [channel, owner, expected] of cases) {
    for (const intakeTag of ['parser', 'hint', 'timezone']) {
      assert.equal(causeOf({ ...reports[0], channel, subject: 'Unrelated subject', meta: { browserLocale: 'en-US', intakeTag } }, owner), expected);
    }
  }
  assert.deepEqual(DEDUPE_CASES.map(({ a, b }) => sameCause(a, tenants.get(a.tenant), b, tenants.get(b.tenant))), [true, false, false, true, false]);
});

test('T2 characterization: 38 intake tags disagree with the actual cause', () => {
  assert.deepEqual(groups.map((group) => group.taggedAs), [{ parser: 356, hint: 23 }, { parser: 15, hint: 18 }]);
  assert.equal(groups.reduce((sum, group) => sum + group.reports.filter((report) => report.meta.intakeTag !== group.cause).length, 0), 38);
  assert.deepEqual(selected.reduce((counts, report) => {
    counts[report.meta.intakeTag] = (counts[report.meta.intakeTag] ?? 0) + 1;
    return counts;
  }, {}), { parser: 371, hint: 41 });
});

test('T3 characterization: all five desk notes are parser footnotes and remain counted once', () => {
  assert.deepEqual(sorted(notes.oneDayMove), sorted(noteIds));
  assert.deepEqual(groups.map((group) => readAs(group, notes.oneDayMove)), [5, 0]);
  for (const id of noteIds) {
    assert.equal(groups[0].reports.filter((report) => report.id === id).length, 1);
    assert.equal(groups[1].reports.filter((report) => report.id === id).length, 0);
  }
  assert.equal(groups.reduce((sum, group) => sum + group.reports.length, 0), 412);
});

test('T1 runner: analysis identifies local sources, counts, disjoint IDs and original date evidence', async () => {
  const result = await runAnalysis();
  assert.deepEqual(result.source, {
    reports: 'src/lib/data/reports-4471.json',
    tenants: 'src/lib/data/tenants',
    deskNotes: 'src/lib/data/desk-notes.json',
    classifier: 'src/lib/kb/causes.ts',
  });
  assert.equal(result.ticket, 4471);
  assert.deepEqual([result.raw, result.unique, result.duplicates], [427, 412, 15]);
  assert.deepEqual(sorted(result.groups.map((group) => group.cause)), ['hint', 'parser']);
  for (const expected of groups) {
    const actual = result.groups.find((group) => group.cause === expected.cause);
    assert.equal(actual.count, expected.cause === 'parser' ? 379 : 33);
    assert.deepEqual(sorted(actual.ids), sorted(expected.reports.map((report) => report.id)));
    assert.equal(actual.ids.length, new Set(actual.ids).size);
    assert.equal(actual.firstSeen, expected.firstSeen);
    assert.equal(actual.lastSeen, expected.lastSeen);
  }
  const ids = result.groups.flatMap((group) => group.ids);
  assert.equal(ids.length, 412);
  assert.equal(new Set(ids).size, 412);
  const dates = result.reportDates.map(({ id, receivedAt, mergedAt }) => ({ id, receivedAt, mergedAt }));
  assert.deepEqual(dates.sort((a, b) => a.id.localeCompare(b.id)),
    selected.map(({ id, receivedAt, mergedAt }) => ({ id, receivedAt, mergedAt })).sort((a, b) => a.id.localeCompare(b.id)));
});

test('T2 runner: analysis exposes actual cause tag counts instead of grouping by intake guess', async () => {
  const result = await runAnalysis();
  assert.deepEqual(result.groups.find((group) => group.cause === 'parser').taggedAs, { parser: 356, hint: 23 });
  assert.deepEqual(result.groups.find((group) => group.cause === 'hint').taggedAs, { parser: 15, hint: 18 });
  assert.equal(result.groups.reduce((sum, group) => sum + Object.entries(group.taggedAs).reduce((n, [tag, count]) => n + (tag === group.cause ? 0 : count), 0), 0), 38);
});

test('T3 runner: five anomalies are footnotes within parser with no third cause or extra reports', async () => {
  const result = await runAnalysis();
  assert.equal(result.groups.length, 2);
  const parser = result.groups.find((group) => group.cause === 'parser');
  const hint = result.groups.find((group) => group.cause === 'hint');
  assert.deepEqual(sorted(parser.footnoteIds), sorted(noteIds));
  assert.deepEqual(hint.footnoteIds, []);
  for (const id of noteIds) {
    assert.equal(parser.ids.filter((reportId) => reportId === id).length, 1);
    assert.equal(hint.ids.includes(id), false);
  }
  assert.equal(result.groups.reduce((sum, group) => sum + group.count, 0), 412);
});
