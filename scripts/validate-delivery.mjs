export function validateDelivery(manifest, mode = 'draft') {
  if (!['draft', 'final'].includes(mode)) throw new Error(`Unknown delivery mode: ${mode}`);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Delivery manifest must be an object');
  }
  for (const key of ['parser', 'hint']) {
    const entry = manifest[key];
    if (!entry || !Object.hasOwn(entry, 'url')) throw new Error(`Missing ${key} URL`);
    if (entry.url === null && mode === 'draft') continue;
    if (typeof entry.url !== 'string' || !/^https:\/\/github\.com\/BMachnik\/mega-s01e03\/issues\/[1-9][0-9]*$/.test(entry.url)) {
      throw new Error(`Invalid ${key} issue URL for ${mode} delivery`);
    }
  }
  return true;
}
