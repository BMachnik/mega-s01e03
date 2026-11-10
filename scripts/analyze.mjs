import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { groupByCause, readAs, uniqueById } from '../src/lib/kb/causes.ts';

const root = new URL('../', import.meta.url);
const source = {
  reports: 'src/lib/data/reports-4471.json',
  tenants: 'src/lib/data/tenants',
  deskNotes: 'src/lib/data/desk-notes.json',
  classifier: 'src/lib/kb/causes.ts',
};
const json = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));

export async function analyze() {
  const [reports, notes, tenantFiles] = await Promise.all([
    json(source.reports),
    json(source.deskNotes),
    readdir(new URL(`${source.tenants}/`, root)),
  ]);
  const tenants = new Map(await Promise.all(
    tenantFiles.filter((name) => name.endsWith('.json')).sort().map(async (name) => {
      const tenant = await json(`${source.tenants}/${name}`);
      return [tenant.handle, tenant];
    }),
  ));
  const ticket = 4471;
  const unique = uniqueById(reports);
  const selected = unique.filter((report) => report.mergedInto === ticket);
  const groups = groupByCause(selected, (report) => tenants.get(report.tenant));

  return {
    source: { ...source },
    ticket,
    raw: reports.length,
    unique: unique.length,
    duplicates: reports.length - unique.length,
    groups: groups.map((group) => ({
      cause: group.cause,
      count: group.reports.length,
      ids: group.reports.map((report) => report.id),
      taggedAs: group.taggedAs,
      footnoteIds: group.reports.filter((report) => notes.oneDayMove.includes(report.id)).map((report) => report.id),
      footnoteCount: readAs(group, notes.oneDayMove),
      tenants: group.tenants,
      firstSeen: group.firstSeen,
      lastSeen: group.lastSeen,
      mergedInto: group.mergedInto,
    })),
    reportDates: selected.map(({ id, receivedAt, mergedAt }) => ({ id, receivedAt, mergedAt })),
  };
}

async function main() {
  const { values } = parseArgs({ options: { write: { type: 'boolean', default: false } } });
  const output = `${JSON.stringify(await analyze(), null, 2)}\n`;
  if (values.write) {
    await writeFile(new URL('delivery/analysis.json', root), output, 'utf8');
  } else {
    process.stdout.write(output);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
