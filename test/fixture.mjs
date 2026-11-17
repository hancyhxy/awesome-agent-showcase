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

export function gifBytes(delaysCs) {
  const frames = delaysCs.map((delay) => Buffer.from([0x21, 0xf9, 0x04, 0x00, delay & 0xff, delay >> 8, 0x00, 0x00, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00]));
  return Buffer.concat([Buffer.from('GIF89a'), Buffer.from([1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 0xff, 0xff, 0xff]), ...frames, Buffer.from([0x3b])]);
}

export const riffChunk = (name, payload) => Buffer.concat([Buffer.from(name), uint(payload.length, 4), payload, Buffer.alloc(payload.length % 2)]);
const uint = (value, length) => {
  const out = Buffer.alloc(length);
  out.writeUIntLE(value, 0, length);
  return out;
};

export const riffWebp = (...chunks) => {
  const body = Buffer.concat([Buffer.from('WEBP'), ...chunks]);
  return Buffer.concat([Buffer.from('RIFF'), uint(body.length, 4), body]);
};

export const webpStill = () => riffWebp(riffChunk('VP8L', Buffer.from([0x2f, 0, 0, 0, 0, 0, 0, 0, 0])));

export function webpBytes(durationsMs) {
  const header = Buffer.concat([Buffer.from([0x02, 0, 0, 0]), uint(0, 3), uint(0, 3)]);
  const frames = durationsMs.map((ms) => riffChunk('ANMF', Buffer.concat([uint(0, 3), uint(0, 3), uint(0, 3), uint(0, 3), uint(ms, 3), Buffer.from([0])])));
  return riffWebp(riffChunk('VP8X', header), ...frames);
}

const box = (name, payload) => {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(payload.length + 8);
  return Buffer.concat([size, Buffer.from(name), payload]);
};

export function mp4Bytes(seconds, timescale = 1000) {
  const mvhd = Buffer.alloc(100);
  mvhd.writeUInt32BE(timescale, 12);
  mvhd.writeUInt32BE(Math.round(seconds * timescale), 16);
  return Buffer.concat([box('ftyp', Buffer.concat([Buffer.from('isom'), Buffer.alloc(4)])), box('moov', box('mvhd', mvhd))]);
}
