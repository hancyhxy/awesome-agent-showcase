import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { loadCollection } from '../scripts/collection.mjs';
import { scanHistory } from '../scripts/scan.mjs';
import { validate } from '../scripts/validate.mjs';
import { REPO } from './fixture.mjs';

const read = (path) => readFileSync(join(REPO, path), 'utf8');

describe('this repository', () => {
  it('validates its items and release records', () => {
    assert.deepEqual(validate(REPO).problems, []);
  });

  it('has prompts that say where to build: a new folder inside the current project folder', () => {
    const { entries } = loadCollection(REPO);
    const prompts = entries.flatMap((entry) => (entry.prompts ?? []).map((prompt) => ({ id: entry.id, text: prompt.text })));
    assert.ok(prompts.length >= 3);
    for (const { id, text } of prompts) {
      if (/\bnew folder\b/i.test(text)) assert.match(text, /\bnew folder inside the current project folder\b/, `${id}: a prompt that names a folder says where it is`);
    }
  });

  it('lists the seven purposes in order', () => {
    const { purposes } = loadCollection(REPO);
    assert.deepEqual(purposes.map(({ id }) => id), ['slides', 'images', 'animation-video', 'coding', 'research', 'personal-workflows', 'agent-setup']);
  });

  it('has a README that is current and honest about its state', () => {
    const run = spawnSync(process.execPath, ['scripts/readme.mjs', '--check'], { cwd: REPO, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const readme = read('README.md');
    assert.ok(readme.includes('[Browse on Hey Atu Market](https://heyatu.com/market?utm_source=github&utm_medium=readme&utm_campaign=market-hero)'));
    assert.ok(readme.includes('[Download Hey Atu for Mac](https://heyatu.com/download)'));
  });

  it('shows a brief for every item and no prompt text in the README', () => {
    const { entries } = loadCollection(REPO);
    const readme = read('README.md');
    for (const entry of entries) {
      assert.ok(entry.brief, `${entry.id} has a brief`);
      assert.ok(readme.includes(entry.brief), `${entry.id}: the README shows the brief`);
      for (const prompt of entry.prompts ?? []) assert.ok(!readme.includes(prompt.text), `${entry.id}: the README hides the prompt text`);
    }
  });

  it('has a hero image of at most 3 MB, linked to Market, with alt text that names the remakes', () => {
    const hero = 'docs/readme/made-with-atu.webp';
    assert.ok(statSync(join(REPO, hero)).size <= 3 * 1024 * 1024);
    const link = 'https://heyatu.com/market?utm_source=github&utm_medium=readme&utm_campaign=market-hero';
    assert.match(read('README.md'), new RegExp(`\\[!\\[[^\\]]*Hey Atu remakes[^\\]]*\\]\\(${hero.replaceAll('.', '\\.')}\\)\\]\\(${link.replaceAll('?', '\\?')}\\)`));
  });

  it('links the two contribution forms and asks for source, run evidence and rights', () => {
    for (const [name, ids] of Object.entries({ 'suggest-an-idea': ['source', 'idea', 'public'], 'provide-material': ['source', 'remake', 'prompt', 'ran-in-atu', 'model-result', 'rights'] })) {
      const form = read(`.github/ISSUE_TEMPLATE/${name}.yml`);
      for (const id of ids) assert.ok(form.includes(`id: ${id}\n`));
      assert.ok(read('CONTRIBUTING.md').includes(`issues/new?template=${name}.yml`));
    }
    assert.match(read('README.md'), /issues\/new\?template=suggest-an-idea\.yml/);
  });

  it('has no importer and no dependency', () => {
    assert.deepEqual(readdirSync(join(REPO, 'scripts')).sort(), ['collection.mjs', 'entry.mjs', 'media.mjs', 'readme.mjs', 'revision.mjs', 'scan.mjs', 'validate.mjs']);
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

  it('states the rules and the removal route of quoted excerpts', () => {
    const rights = read('THIRD-PARTY.md');
    assert.match(rights, /## Quoted excerpts/);
    assert.match(rights, /at most 8 seconds and at most 2 MB/);
    assert.match(rights, /stays the author's work/);
    assert.match(rights, /support@heyatu\.com/);
    assert.match(rights, /open an issue/);
    assert.match(read('docs/entry-contract.md'), /`quoted` \| `holder`, `sourceUrl`, `excerpt`/);
  });

  it('keeps both licence files', () => {
    assert.match(read('LICENSE'), /^MIT License/);
    assert.match(read('LICENSE-CONTENT'), /Attribution 4\.0 International/);
  });

  it('has clean history when it is a Git repository', { skip: !existsSync(join(REPO, '.git')) }, () => {
    assert.deepEqual(scanHistory(REPO), []);
  });
});
