import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { countPurposes, linkState, loadCollection } from '../scripts/collection.mjs';
import { BLOCK_START, renderBlock, replaceBlock, trackedUrl } from '../scripts/readme.mjs';
import { REPO, syntheticPostEntry, syntheticRoot, writeEntry } from './fixture.mjs';

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
