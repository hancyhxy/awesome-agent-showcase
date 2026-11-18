import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { loadCollection } from '../scripts/collection.mjs';
import { scanHistory } from '../scripts/scan.mjs';
import { durationMs } from '../scripts/media.mjs';
import { validate } from '../scripts/validate.mjs';
import { REPO } from './fixture.mjs';

const read = (path) => readFileSync(join(REPO, path), 'utf8');
const HERO_ENTRIES = ['x-2089289550958903358', 'x-2097383854923538770', 'x-2109112248832503895', 'x-2111383736243859714', 'x-2103473953868063151', 'x-2121392666244186327', 'x-2103770889116627075', 'x-2122013352755126431', 'x-2119458988165370270'];

function webpCanvas(bytes) {
  assert.equal(bytes.toString('latin1', 0, 4), 'RIFF');
  assert.equal(bytes.toString('latin1', 8, 12), 'WEBP');
  assert.equal(bytes.toString('latin1', 12, 16), 'VP8X');
  return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3), animated: (bytes[20] & 2) !== 0 };
}

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
    assert.ok(readme.includes('[Mac app](https://heyatu.com/download/mac)'));
    assert.ok(readme.includes('curl -fsSL https://heyatu.com/install \\| sh'));
    assert.ok(readme.includes('[ChatGPT, Claude, Codex, Claude Code](https://heyatu.com/ai-apps)'));
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

  it('shows the hero as one picture linked to Market, with a still and a narrow variant', () => {
    const readme = read('README.md');
    const picture = readme.match(/<a href="([^"]+)"><picture>(.*?)<\/picture><\/a>/);
    assert.ok(picture, 'the hero is a linked picture');
    assert.equal(picture[1], 'https://heyatu.com/market?utm_source=github&amp;utm_medium=readme&amp;utm_campaign=market-hero');
    const sources = [...picture[2].matchAll(/<source media="([^"]+)" srcset="([^"]+)">/g)].map(([, media, srcset]) => [media, srcset]);
    assert.deepEqual(sources, [
      ['(prefers-reduced-motion: reduce) and (max-width: 600px)', 'docs/readme/hero-narrow-still.jpg'],
      ['(prefers-reduced-motion: reduce)', 'docs/readme/hero-still.jpg'],
      ['(max-width: 600px)', 'docs/readme/hero-narrow.webp'],
    ]);
    assert.match(picture[2], /<img src="docs\/readme\/hero\.webp" alt="[^"]+"/);
  });

  it('has hero images of the stated size and at most 5 MB, animated for 8 to 10 s, with a still of each', () => {
    for (const [name, still, width, height] of [['hero', 'hero-still', 1600, 900], ['hero-narrow', 'hero-narrow-still', 900, 1200]]) {
      const bytes = readFileSync(join(REPO, `docs/readme/${name}.webp`));
      assert.ok(bytes.length <= 5 * 1024 * 1024, `${name} is at most 5 MB`);
      assert.deepEqual(webpCanvas(bytes), { width, height, animated: true });
      const seconds = durationMs(`${name}.webp`, bytes) / 1000;
      assert.ok(seconds >= 8 && seconds <= 10, `${name} loops for ${seconds} s`);
      assert.deepEqual([...readFileSync(join(REPO, `docs/readme/${still}.jpg`)).subarray(0, 3)], [0xff, 0xd8, 0xff]);
    }
    assert.equal(existsSync(join(REPO, 'docs/readme/made-with-atu.webp')), false);
  });

  it('credits the nine source posts of the hero tiles in the alt text and in Sources and rights', () => {
    const readme = read('README.md');
    const alt = readme.match(/<img src="docs\/readme\/hero\.webp" alt="([^"]+)"/)[1];
    const rights = readme.slice(readme.indexOf('## Sources and rights'), readme.indexOf('## Repository'));
    const { entries } = loadCollection(REPO);
    const tiles = HERO_ENTRIES.map((id) => entries.find((entry) => entry.id === id));
    for (const entry of tiles) {
      assert.ok(entry, 'a hero entry exists');
      const cover = entry.rights.assets.find(({ path }) => path === entry.cover.motion);
      assert.equal(cover.basis, 'quoted', `${entry.id}: the tile plays a quoted cover`);
      assert.ok(alt.includes(`@${entry.source.author}`), `${entry.id}: the alt text names the author`);
      assert.ok(rights.includes(`[@${entry.source.author}](${entry.source.url})`), `${entry.id}: Sources and rights links the post`);
    }
    assert.match(alt, /excerpts of the credited source posts/);
  });

  it('has the badges, each linked with campaign labels, and the works-with wall', () => {
    const readme = read('README.md');
    for (const [file, host, campaign] of [['heyatu', 'heyatu.com', 'badge-heyatu'], ['market', 'heyatu.com', 'badge-market'], ['download-mac', 'heyatu.com', 'badge-download'], ['free-start', 'heyatu.com', 'badge-free-start'], ['licence', 'github.com', 'badge-licence']]) {
      assert.match(readme, new RegExp(`<a href="https://${host.replace('.', '\\.')}[^"#]*utm_source=github&amp;utm_medium=readme&amp;utm_campaign=${campaign}[^"]*"><img src="docs/readme/badges/${file}\\.svg"`));
    }
    assert.match(readme, /badge-licence#sources-and-rights"><img/);
    for (const file of ['heyatu', 'market', 'download-mac', 'free-start', 'licence']) assert.match(read(`docs/readme/badges/${file}.svg`), /^<svg /);
    assert.match(readme, /srcset="docs\/readme\/works-with-narrow\.png"/);
    assert.match(readme, /<img src="docs\/readme\/works-with\.png"/);
    assert.match(readme, /Logos are trademarks of their owners\./);
    for (const file of ['works-with', 'works-with-narrow']) assert.ok(statSync(join(REPO, `docs/readme/${file}.png`)).size > 0);
  });

  it('keeps the section links of the head and their headings in order', () => {
    const readme = read('README.md');
    const links = [...readme.matchAll(/<a href="#([a-z-]+)">[A-Z]/g)].map(([, anchor]) => anchor);
    assert.deepEqual(links, ['your-own-ai-on-your-own-computer', 'install', 'works-with-your-ai', 'ideas', 'suggest-an-idea']);
    const headings = [...readme.matchAll(/^## (.+)$/gm)].map(([, heading]) => heading);
    assert.deepEqual(headings.slice(0, 5), ['Your own AI, on your own computer', 'Install', 'Works with your AI', 'Ideas', 'Suggest an idea']);
    assert.doesNotMatch(readme, /open source/i);
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
