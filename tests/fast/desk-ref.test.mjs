import test from 'node:test';
import assert from 'node:assert/strict';

// Captured by executing the original export's desk-ref.ts before copying src.
// This constant is deliberately independent of the function under test.
const expected = 'DR-HSVT-4XQA';

test('T4: BMachnik has the desk ref calculated from the original export', async () => {
  const { deskRef } = await import('../../src/lib/kb/desk-ref.ts');
  assert.equal(deskRef('BMachnik'), expected);
});

test('T4: surrounding whitespace does not change the signed desk ref', async () => {
  const { deskRef } = await import('../../src/lib/kb/desk-ref.ts');
  assert.equal(deskRef(' \tBMachnik\r\n '), expected);
});
