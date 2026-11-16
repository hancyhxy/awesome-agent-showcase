import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { scanPath, scanText, scanTree } from '../scripts/scan.mjs';
import { syntheticRoot } from './fixture.mjs';

const rules = (findings) => findings.map(({ rule }) => rule);
const user = ['', 'Users', 'synthetic', 'project'].join('/');
const fakeToken = `gh${'p'}_${'A1'.repeat(18)}`;
const fakeKeyHeader = `-----BEGIN ${'RSA'} PRIVATE KEY-----`;

describe('public tree scan', () => {
  let sandbox;
  beforeEach(() => { sandbox = syntheticRoot(); });
  afterEach(() => sandbox.cleanup());

  it('passes clean public text', () => {
    assert.deepEqual(scanText('a.md', 'Synthetic public text about slides.\nhttps://heyatu.com/market/x-1'), []);
  });

  it('flags personal paths, credentials, session data and email addresses', () => {
    assert.deepEqual(rules(scanText('a.md', `see ${user}/file`)), ['personal path']);
    assert.deepEqual(rules(scanText('a.md', `value ${fakeToken}`)), ['credential']);
    assert.deepEqual(rules(scanText('a.md', fakeKeyHeader)), ['credential']);
    assert.deepEqual(rules(scanText('a.md', `API_KEY = "${'x'.repeat(24)}"`)), ['credential assignment']);
    assert.deepEqual(rules(scanText('a.md', ['{"type": "sess', 'ion", "id": "synthetic"}'].join(''))), ['session record']);
    assert.deepEqual(rules(scanText('a.md', ['synthetic', 'example.com'].join('@'))), ['email address']);
    assert.deepEqual(scanText('a.md', ['1+synthetic', 'users.noreply.github.com'].join('@')), []);
    assert.equal(scanText('a.md', 'ok\nok\n' + user + '/x')[0].where, 'a.md:3');
  });

  it('flags private export names and directories', () => {
    for (const path of ['export.jsonl', 'a/.env', '.env.local', 'topics/123/post.md', 'notes/.DS_Store', 'key.pem']) {
      assert.equal(scanPath(path).length, 1, path);
    }
    assert.deepEqual(scanPath('entries/x-1/entry.json'), []);
  });

  it('scans a tree and flags a symbolic link without echoing the secret', () => {
    mkdirSync(join(sandbox.root, 'docs'));
    writeFileSync(join(sandbox.root, 'docs/note.md'), `token ${fakeToken}\n`);
    symlinkSync('/etc/hosts', join(sandbox.root, 'docs/link.md'));
    const findings = scanTree(sandbox.root);
    assert.deepEqual(findings.map(({ where, rule }) => `${where} ${rule}`).sort(), ['docs/link.md symbolic link', 'docs/note.md:1 credential']);
    assert.ok(findings.every((finding) => !JSON.stringify(finding).includes(fakeToken)));
  });
});
