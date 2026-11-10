import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const draft = () => ({ parser: { url: null }, hint: { url: null } });
// Syntactically valid examples only: these tests do not claim issue existence.
const final = () => ({
  parser: { url: 'https://github.com/BMachnik/mega-s01e03/issues/12' },
  hint: { url: 'https://github.com/BMachnik/mega-s01e03/issues/34' },
});
const validator = async () => (await import('../../scripts/validate-delivery.mjs')).validateDelivery;

test('T5: the checked-in manifest declares both issue links and validates locally', async () => {
  const manifest = JSON.parse(await readFile(new URL('../../delivery/issues.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(manifest).sort(), ['hint', 'parser']);
  const validateDelivery = await validator();
  assert.equal(validateDelivery(manifest, 'draft'), true);
});

test('T5: draft accepts two explicit null links', async () => {
  const validateDelivery = await validator();
  assert.equal(validateDelivery(draft(), 'draft'), true);
});

test('T5: final accepts two HTTPS issue URLs in the approved repository', async () => {
  const validateDelivery = await validator();
  assert.equal(validateDelivery(final(), 'final'), true);
});

for (const key of ['parser', 'hint']) {
  test(`T5: final rejects an unpublished ${key} link`, async () => {
    const validateDelivery = await validator();
    const manifest = final();
    manifest[key].url = null;
    assert.throws(() => validateDelivery(manifest, 'final'), Error);
  });
}

for (const url of [
  'http://github.com/BMachnik/mega-s01e03/issues/1',
  'javascript:alert(1)',
  'https://example.com/BMachnik/mega-s01e03/issues/1',
  'https://github.com.evil.example/BMachnik/mega-s01e03/issues/1',
  'https://github.com/SomeoneElse/mega-s01e03/issues/1',
  'https://github.com/BMachnik/other-repo/issues/1',
  'https://github.com/BMachnik/mega-s01e03/pull/1',
  'https://github.com/BMachnik/mega-s01e03/issues',
  'https://github.com/BMachnik/mega-s01e03/issues/not-an-id',
  '',
]) {
  test(`T5: final rejects invalid issue URL ${JSON.stringify(url)}`, async () => {
    const validateDelivery = await validator();
    for (const key of ['parser', 'hint']) {
      const manifest = final();
      manifest[key].url = url;
      assert.throws(() => validateDelivery(manifest, 'final'), Error, key);
    }
  });
}

test('T5: missing issue entries are not explicit unpublished links', async () => {
  const validateDelivery = await validator();
  for (const manifest of [{}, { parser: { url: null } }, { parser: {}, hint: { url: null } }]) {
    assert.throws(() => validateDelivery(manifest, 'draft'), Error);
  }
});
