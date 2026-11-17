import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { countPurposes, linkState, loadCollection } from '../scripts/collection.mjs';
import { BLOCK_START, renderBlock, replaceBlock, trackedUrl } from '../scripts/readme.mjs';
import { REPO, gifBytes, syntheticPostEntry, syntheticRoot, webpStill, writeEntry } from './fixture.mjs';

let sandbox;
beforeEach(() => { sandbox = syntheticRoot(); });
afterEach(() => sandbox.cleanup());

const record = (entry, overrides = {}) => ({
  id: entry.id,
  revision: entry.revision,
  url: `https://heyatu.com/market/${entry.id}`,
  release: 'synthetic-release-0001',
  ...overrides,
});
const writeDeployments = (records) => writeFileSync(join(sandbox.root, 'deployments.json'), JSON.stringify(records));

describe('counts', () => {
  it('counts the empty collection as zero in every purpose', () => {
    const { purposes, entries, errors } = loadCollection(sandbox.root);
    assert.deepEqual(errors, []);
    const { total, counts } = countPurposes(purposes, entries);
    assert.equal(total, 0);
    assert.equal(counts.length, 7);
    assert.ok(counts.every(({ count }) => count === 0));
  });

  it('counts a multi-purpose item once in each purpose and once in the total', () => {
    writeEntry(sandbox.root, syntheticPostEntry(1, { purposes: ['slides', 'images'] }));
    writeEntry(sandbox.root, syntheticPostEntry(2, { purposes: ['images'] }));
    const { purposes, entries } = loadCollection(sandbox.root);
    const { total, counts } = countPurposes(purposes, entries);
    assert.equal(total, 2);
    assert.deepEqual(Object.fromEntries(counts.map(({ id, count }) => [id, count])).slides, 1);
    assert.equal(counts.find(({ id }) => id === 'images').count, 2);
    assert.equal(counts.reduce((sum, { count }) => sum + count, 0), 3);
  });
});

describe('deployment records and links', () => {
  it('has no link without a record', () => {
    const { entry } = writeEntry(sandbox.root, syntheticPostEntry(1));
    const collection = loadCollection(sandbox.root);
    assert.equal(linkState(entry, collection.deployments), 'none');
    assert.doesNotMatch(renderBlock(collection), /heyatu\.com/);
  });

  it('links an item with a matching record', () => {
    const { entry } = writeEntry(sandbox.root, syntheticPostEntry(1));
    writeDeployments([record(entry)]);
    const collection = loadCollection(sandbox.root);
    assert.deepEqual(collection.errors, []);
    assert.equal(linkState(entry, collection.deployments), 'live');
    const block = renderBlock(collection);
    assert.ok(block.includes(`(${trackedUrl(entry.id, 'market-grid')})`));
    assert.ok(block.includes(`(${trackedUrl(entry.id, 'market-category')})`));
    assert.match(trackedUrl(entry.id, 'market-hero'), /^https:\/\/heyatu\.com\/market\/x-\d+\?utm_source=github&utm_medium=readme&utm_campaign=market-hero$/);
  });

  it('keeps the link of the released revision when the draft is newer', () => {
    const { entry } = writeEntry(sandbox.root, syntheticPostEntry(1));
    writeDeployments([record(entry, { revision: `sha256:${'0'.repeat(64)}` })]);
    const collection = loadCollection(sandbox.root);
    assert.deepEqual(collection.errors, []);
    assert.equal(linkState(entry, collection.deployments), 'stale');
    assert.ok(renderBlock(collection).includes(trackedUrl(entry.id, 'market-grid')));
  });

  it('rejects an unsupported record', () => {
    const { entry } = writeEntry(sandbox.root, syntheticPostEntry(1));
    const cases = [
      [record(entry, { id: 'x-404' }), /is not an item/],
      [record(entry, { url: 'https://heyatu.com/market/x-100000000000000001/' }), /url must be/],
      [record(entry, { url: 'https://example.com/market/x-100000000000000001' }), /url must be/],
      [record(entry, { revision: 'abc' }), /full revision/],
      [record(entry, { release: '/Volumes/synthetic/path' }), /release must be/],
      [{ id: entry.id, revision: entry.revision, url: record(entry).url }, /exactly id, revision, url and release/],
    ];
    for (const [bad, pattern] of cases) {
      writeDeployments([bad]);
      assert.match(loadCollection(sandbox.root).errors.join('\n'), pattern);
    }
    writeDeployments([record(entry), record(entry)]);
    assert.match(loadCollection(sandbox.root).errors.join('\n'), /repeats the record/);
  });
});

describe('generated README block', () => {
  const sample = `before\n${BLOCK_START}\nold\n<!-- collection:end -->\nafter\n`;

  it('is deterministic, sorted by ID and unchanged on a second run', () => {
    writeEntry(sandbox.root, syntheticPostEntry(2, { purposes: ['coding'], title: 'SYNTHETIC SECOND' }));
    writeEntry(sandbox.root, syntheticPostEntry(1, { title: 'SYNTHETIC FIRST' }));
    const collection = loadCollection(sandbox.root);
    const first = replaceBlock(sample, renderBlock(collection));
    assert.equal(replaceBlock(first, renderBlock(collection)), first);
    assert.ok(first.startsWith('before\n') && first.endsWith('after\n'));
    assert.ok(first.indexOf('SYNTHETIC FIRST') < first.indexOf('SYNTHETIC SECOND'));
  });

  it('escapes Markdown in item text', () => {
    writeEntry(sandbox.root, syntheticPostEntry(1, { title: 'A [link](x) <b>' }));
    assert.match(renderBlock(loadCollection(sandbox.root)), /A \\\[link\\\]\(x\) \\<b\\>/);
  });

  it('shows the cover (a GIF, else the still) of an item, in All items only, and never the prompt', () => {
    const rights = { assets: ['media/cover.png', 'media/loop.gif', 'media/clip.mp4'].map((path) => ({ path, basis: 'original' })) };
    const files = { 'media/cover.png': Buffer.from('a'), 'media/loop.gif': Buffer.from('b'), 'media/clip.mp4': Buffer.from('c') };
    const prompts = [{ choice: 'main', status: 'proposed', text: 'SYNTHETIC SECRET PROMPT' }];
    const action = { label: 'Make it in Atu', prompt: 'main' };
    writeEntry(sandbox.root, syntheticPostEntry(1, { title: 'GIF ITEM', rights, prompts, action, cover: { motion: 'media/loop.gif', still: 'media/cover.png' } }), { files });
    writeEntry(sandbox.root, syntheticPostEntry(2, { title: 'MP4 ITEM', rights, cover: { motion: 'media/clip.mp4', still: 'media/cover.png' } }), { files });
    writeEntry(sandbox.root, syntheticPostEntry(3, { title: 'PLAIN ITEM' }));
    const collection = loadCollection(sandbox.root);
    assert.deepEqual(collection.errors, []);
    const block = renderBlock(collection);
    assert.equal(block.match(/!\[GIF ITEM\]\(entries\/x-100000000000000001\/media\/loop\.gif\)/g).length, 1);
    assert.equal(block.match(/!\[MP4 ITEM\]\(entries\/x-100000000000000002\/media\/cover\.png\)/g).length, 1);
    assert.doesNotMatch(block, /PLAIN ITEM\]\(entries/);
    assert.doesNotMatch(block, /SYNTHETIC SECRET PROMPT|Make it in Atu/);
  });

  it('shows "via @handle" under the cover of a quoted file only', () => {
    const post = 'https://x.com/synthetic_user/status/100000000000000001';
    const quoted = (path) => ({ path, basis: 'quoted', holder: 'synthetic_user', sourceUrl: post, excerpt: '0:16-0:20 of the post video' });
    const original = (path) => ({ path, basis: 'original' });
    writeEntry(sandbox.root, syntheticPostEntry(1, { title: 'QUOTED ITEM', rights: { assets: [quoted('media/loop.gif'), quoted('media/still.webp')] }, media: [], cover: { motion: 'media/loop.gif', still: 'media/still.webp' } }),
      { files: { 'media/loop.gif': gifBytes([100, 100]), 'media/still.webp': webpStill() } });
    writeEntry(sandbox.root, syntheticPostEntry(2, { title: 'OWN ITEM', rights: { assets: [original('media/loop.gif'), original('media/cover.png')] }, media: [], cover: { motion: 'media/loop.gif', still: 'media/cover.png' } }),
      { files: { 'media/loop.gif': Buffer.from('a'), 'media/cover.png': Buffer.from('b') } });
    const collection = loadCollection(sandbox.root);
    assert.deepEqual(collection.errors, []);
    const block = renderBlock(collection);
    assert.equal(block.match(/via /g).length, 1);
    assert.match(block, /!\[QUOTED ITEM\]\(entries\/x-100000000000000001\/media\/loop\.gif\)\n\n {2}via \[@synthetic_user\]\(https:\/\/x\.com\/synthetic_user\/status\/100000000000000001\)\n/);
  });

  it('lists the empty collection honestly', () => {
    const block = renderBlock(loadCollection(sandbox.root));
    assert.match(block, /No items are listed yet\./);
    assert.match(block, /\| \*\*All items \(each counted once\)\*\* \| \*\*0\*\* \|/);
  });

  it('fails check mode when the block is stale and passes after a rebuild', () => {
    cpSync(join(REPO, 'scripts'), join(sandbox.root, 'scripts'), { recursive: true });
    cpSync(join(REPO, 'README.md'), join(sandbox.root, 'README.md'));
    const run = (...args) => spawnSync(process.execPath, ['scripts/readme.mjs', ...args], { cwd: sandbox.root, encoding: 'utf8' });
    assert.equal(run('--check').status, 0);
    writeEntry(sandbox.root, syntheticPostEntry(1));
    const stale = run('--check');
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /collection block is stale/);
    assert.equal(run().status, 0);
    const rebuilt = readFileSync(join(sandbox.root, 'README.md'), 'utf8');
    assert.match(rebuilt, /SYNTHETIC TEST ENTRY/);
    assert.equal(run('--check').status, 0);
    assert.equal(run().status, 0);
    assert.equal(readFileSync(join(sandbox.root, 'README.md'), 'utf8'), rebuilt);
  });

  it('rejects a README without block markers', () => {
    assert.throws(() => replaceBlock('no markers', 'x'), /no collection block markers/);
  });
});
