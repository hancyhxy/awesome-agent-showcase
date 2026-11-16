import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { loadCollection } from '../scripts/collection.mjs';
import { syntheticEntry, syntheticPostEntry, syntheticRoot, writeEntry } from './fixture.mjs';

let sandbox;
beforeEach(() => { sandbox = syntheticRoot(); });
afterEach(() => sandbox.cleanup());

const errorsFor = (entry, options) => {
  sandbox.cleanup();
  sandbox = syntheticRoot();
  writeEntry(sandbox.root, entry, options);
  return loadCollection(sandbox.root).errors.join('\n');
};

describe('entry validation', () => {
  it('accepts a synthetic entry', () => {
    assert.equal(errorsFor(syntheticEntry()), '');
  });

  it('rejects an ID with a bad shape or a bad length', () => {
    for (const id of ['X-1', 'x_1', `x-${'1'.repeat(31)}`]) {
      assert.match(errorsFor(syntheticEntry({ id }), { dir: 'bad-dir' }), /id must be 1 to 32/);
    }
  });

  it('requires the directory name to equal the ID', () => {
    assert.match(errorsFor(syntheticEntry(), { dir: 'x-other' }), /does not match the directory/);
  });

  it('ties an X ID to the source post and a tool ID to the tool prefix', () => {
    assert.match(errorsFor(syntheticEntry({ id: 'x-999' }), { dir: 'x-999' }), /id must be x-100000000000000001/);
    const docs = syntheticEntry({
      id: 'x-docs',
      source: { type: 'package-docs', url: 'https://example.com/docs/tool', package: 'synthetic-tool', credit: 'Synthetic tool docs', capturedAt: '2026-01-03' },
    });
    assert.match(errorsFor(docs, { dir: 'x-docs' }), /must start with tool-/);
  });

  it('accepts package documentation as provenance', () => {
    const docs = syntheticEntry({
      id: 'tool-synthetic',
      source: { type: 'package-docs', url: 'https://example.com/docs/tool', package: 'synthetic-tool', credit: 'Synthetic tool docs', capturedAt: '2026-01-03' },
    });
    assert.equal(errorsFor(docs), '');
  });

  it('rejects duplicate IDs and duplicate source keys', () => {
    const first = syntheticEntry();
    writeEntry(sandbox.root, first);
    writeEntry(sandbox.root, { ...syntheticPostEntry(2), source: first.source, id: 'x-100000000000000001' }, { dir: 'x-copy' });
    const errors = loadCollection(sandbox.root).errors.join('\n');
    assert.match(errors, /duplicate id x-100000000000000001/);
    assert.match(errors, /duplicate source x:100000000000000001/);
  });

  it('rejects unknown purposes and entries without a purpose', () => {
    assert.match(errorsFor(syntheticEntry({ purposes: ['cooking'] })), /unknown purpose "cooking"/);
    assert.match(errorsFor(syntheticEntry({ purposes: [] })), /at least one purpose/);
  });

  it('requires a public credit and a rights record', () => {
    const entry = syntheticEntry();
    delete entry.source.credit;
    assert.match(errorsFor(entry), /source.credit must be/);
  });

  it('rejects unsafe source URLs', () => {
    for (const url of ['http://x.com/a/status/1', `https://${['user:pass', 'x.com'].join('@')}/a/status/1`, 'https://x.com/a/status/1?utm=1', 'https://localhost/a', 'https://127.0.0.1/a', 'javascript:alert(1)']) {
      const entry = syntheticEntry({ source: { ...syntheticEntry().source, url } });
      assert.match(errorsFor(entry), /source.url/, url);
    }
  });

  it('rejects an asset path outside the entry', () => {
    for (const path of ['media/../body.md', '../../outside.png', '/etc/passwd.png', 'media\\cover.png', 'media/a/b.png']) {
      const entry = syntheticEntry({ media: [{ path, alt: 'Synthetic' }] });
      assert.match(errorsFor(entry), /media\[0\]\.path must be media/, path);
    }
  });

  it('rejects a symbolic link that leaves the entry', () => {
    const { base } = writeEntry(sandbox.root, syntheticEntry(), { files: {} });
    symlinkSync('/etc/hosts', join(base, 'media/cover.png'));
    assert.match(loadCollection(sandbox.root).errors.join('\n'), /media\/cover.png is a symbolic link/);
  });

  it('rejects a missing asset and an unrecorded asset', () => {
    assert.match(errorsFor(syntheticEntry(), { files: {} }), /media\/cover.png is referenced but missing/);
    const entry = syntheticEntry({ rights: { assets: [] } });
    assert.match(errorsFor(entry), /stored without a rights record/);
  });

  it('rejects a raw export, a script and an unsupported asset', () => {
    const { base } = writeEntry(sandbox.root, syntheticEntry());
    writeFileSync(join(base, 'raw-export.json'), '{}');
    writeFileSync(join(base, 'media/run.js'), 'x');
    writeFileSync(join(base, 'media/shape.svg'), '<svg/>');
    const errors = loadCollection(sandbox.root).errors.join('\n');
    assert.match(errors, /raw-export.json is not allowed/);
    assert.match(errors, /media\/run.js is not a supported asset/);
    assert.match(errors, /media\/shape.svg is not a supported asset/);
  });

  it('rejects a third-party asset without a valid rights basis', () => {
    const rights = (asset) => syntheticEntry({ rights: { assets: [{ path: 'media/cover.png', ...asset }] } });
    assert.match(errorsFor(rights({ basis: 'scraped' })), /basis must be original, licensed or permission/);
    assert.match(errorsFor(rights({ basis: 'licensed', holder: 'Synthetic Holder' })), /licence must be/);
    assert.equal(errorsFor(rights({ basis: 'permission', holder: 'Synthetic Holder', grantedOn: '2026-01-04' })), '');
  });

  it('rejects executable markup in the body', () => {
    assert.match(errorsFor(syntheticEntry(), { body: 'Hello <script>1</script>' }), /executable markup/);
    assert.match(errorsFor(syntheticEntry(), { body: '<img src="a.png" onerror=1>' }), /executable markup/);
  });

  it('keeps prompt choice separate from verification status', () => {
    const prompts = [
      { choice: 'paper-garden', status: 'original', text: 'Synthetic prompt' },
      { choice: 'synthwave', status: 'tested', text: 'Synthetic prompt', testedOn: '2026-01-05' },
    ];
    assert.equal(errorsFor(syntheticEntry({ prompts })), '');
    const bad = [{ choice: 'a', status: 'tested', text: 't' }, { choice: 'a', status: 'proposed', text: 't' }];
    const errors = errorsFor(syntheticEntry({ prompts: bad }));
    assert.match(errors, /testedOn must be a date/);
    assert.match(errors, /choice a is repeated/);
  });

  it('requires public evidence for a tool tag and rejects unknown fields', () => {
    assert.match(errorsFor(syntheticEntry({ tags: [{ kind: 'tool', name: 'Synthetic' }] })), /evidence must be/);
    assert.match(errorsFor(syntheticEntry({ approved: true })), /approved is not allowed/);
  });

  it('rejects an entries folder that is a symbolic link', () => {
    sandbox.cleanup();
    sandbox = syntheticRoot();
    symlinkSync(sandbox.root, join(sandbox.root, 'entries'));
    assert.match(loadCollection(sandbox.root).errors.join('\n'), /entries must be a directory/);
  });

  it('accepts an empty entries folder', () => {
    mkdirSync(join(sandbox.root, 'entries'));
    assert.deepEqual(loadCollection(sandbox.root).errors, []);
  });
});
