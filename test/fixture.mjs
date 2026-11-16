import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { revisionOf } from '../scripts/revision.mjs';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SYNTHETIC_BYTES = Buffer.from('SYNTHETIC TEST ASSET');

export function syntheticRoot() {
  const root = mkdtempSync(join(tmpdir(), 'showcase-test-'));
  cpSync(join(REPO, 'tags'), join(root, 'tags'), { recursive: true });
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

export function syntheticEntry(overrides = {}) {
  return {
    id: 'x-100000000000000001',
    title: 'SYNTHETIC TEST ENTRY',
    summary: 'Synthetic summary for a test. Not a real item.',
    purposes: ['slides'],
    source: {
      type: 'x-post',
      url: 'https://x.com/synthetic_user/status/100000000000000001',
      author: 'synthetic_user',
      credit: 'Synthetic User, public post',
      publishedAt: '2026-01-02',
      capturedAt: '2026-01-03',
    },
    rights: { assets: [{ path: 'media/cover.png', basis: 'original' }] },
    media: [{ path: 'media/cover.png', alt: 'Synthetic cover image' }],
    requirements: ['A synthetic requirement'],
    revision: '',
    ...overrides,
  };
}

export function writeEntry(root, entry, { body = 'Synthetic body.\n', files = { 'media/cover.png': SYNTHETIC_BYTES }, seal = true, dir = entry.id } = {}) {
  const base = join(root, 'entries', dir);
  mkdirSync(join(base, 'media'), { recursive: true });
  writeFileSync(join(base, 'body.md'), body);
  const stored = new Map([['body.md', Buffer.from(body)]]);
  for (const [name, bytes] of Object.entries(files)) {
    writeFileSync(join(base, name), bytes);
    stored.set(name, Buffer.from(bytes));
  }
  const sealed = seal ? { ...entry, revision: revisionOf(entry, stored) } : entry;
  writeFileSync(join(base, 'entry.json'), JSON.stringify(sealed, null, 2));
  return { base, entry: sealed };
}

export const syntheticPostEntry = (n, overrides = {}) => syntheticEntry({
  id: `x-10000000000000000${n}`,
  source: { ...syntheticEntry().source, url: `https://x.com/synthetic_user/status/10000000000000000${n}` },
  ...overrides,
});
