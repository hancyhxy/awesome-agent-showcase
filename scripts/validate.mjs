import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCollection, loadPurposes } from './collection.mjs';
import { loadEntry } from './entry.mjs';
import { scanHistory, scanTree } from './scan.mjs';

export function validate(root, { history = false } = {}) {
  const collection = loadCollection(root);
  const findings = scanTree(root);
  if (history && existsSync(join(root, '.git'))) findings.push(...scanHistory(root));
  const problems = [...collection.errors, ...findings.map(({ where, rule }) => `${where}: ${rule}`)];
  return { collection, problems };
}

function main() {
  const args = process.argv.slice(2);
  const option = (name) => args[args.indexOf(name) + 1];
  const root = args.includes('--root') ? resolve(option('--root')) : join(dirname(fileURLToPath(import.meta.url)), '..');
  if (args.includes('--revision')) {
    const purposeIds = loadPurposes(root, []).map((purpose) => purpose.id);
    const { revision } = loadEntry(join(root, 'entries', option('--revision')), purposeIds);
    console.log(revision ?? 'revision cannot be computed');
    process.exit(revision ? 0 : 1);
  }
  const { collection, problems } = validate(root, { history: args.includes('--history') });
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`ok: ${collection.entries.length} items, ${collection.deployments.length} deployment records`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
