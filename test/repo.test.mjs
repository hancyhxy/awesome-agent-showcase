import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { loadCollection } from '../scripts/collection.mjs';
import { scanHistory } from '../scripts/scan.mjs';
import { validate } from '../scripts/validate.mjs';
import { REPO } from './fixture.mjs';

const read = (path) => readFileSync(join(REPO, path), 'utf8');

describe('this repository', () => {
  it('validates as an empty collection without deployment records', () => {
    const { collection, problems } = validate(REPO);
    assert.deepEqual(problems, []);
    assert.equal(collection.entries.length, 0);
    assert.equal(collection.deployments.length, 0);
    assert.equal(existsSync(join(REPO, 'entries')), false);
    assert.equal(existsSync(join(REPO, 'deployments.json')), false);
  });

  it('lists the seven purposes in order', () => {
    const { purposes } = loadCollection(REPO);
    assert.deepEqual(purposes.map(({ id }) => id), ['slides', 'images', 'animation-video', 'coding', 'research', 'personal-workflows', 'agent-setup']);
  });

  it('has a README that is current and honest about its state', () => {
    const run = spawnSync(process.execPath, ['scripts/readme.mjs', '--check'], { cwd: REPO, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const readme = read('README.md');
    assert.match(readme, /being prepared/);
    assert.match(readme, /\(https:\/\/heyatu\.com\)/);
    assert.doesNotMatch(readme, /heyatu\.com\/market/);
  });

  it('has no importer and no dependency', () => {
    assert.deepEqual(readdirSync(join(REPO, 'scripts')).sort(), ['collection.mjs', 'entry.mjs', 'readme.mjs', 'revision.mjs', 'scan.mjs', 'validate.mjs']);
    assert.equal(JSON.parse(read('package.json')).dependencies, undefined);
  });

  it('has a least-privilege workflow with pinned actions', () => {
    const workflow = read('.github/workflows/check.yml');
    assert.match(workflow, /^permissions:\n {2}contents: read$/m);
    assert.doesNotMatch(workflow, /pull_request_target|secrets\.|write/);
    const uses = [...workflow.matchAll(/uses: (\S+)/g)].map(([, name]) => name);
    assert.ok(uses.length >= 2);
    for (const name of uses) assert.match(name, /@[0-9a-f]{40}$/);
    assert.match(workflow, /node-version: \d+\.\d+\.\d+/);
  });

  it('keeps both licence files', () => {
    assert.match(read('LICENSE'), /^MIT License/);
    assert.match(read('LICENSE-CONTENT'), /Attribution 4\.0 International/);
  });

  it('has clean history when it is a Git repository', { skip: !existsSync(join(REPO, '.git')) }, () => {
    assert.deepEqual(scanHistory(REPO), []);
  });
});
