import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ID_PATTERN, REVISION_PATTERN, loadEntry, marketUrl, sourceKey } from './entry.mjs';

const RELEASE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{6,63}$/;

function readJson(path, errors) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    errors.push(`${path} cannot be read: ${error.code ?? error.message}`);
    return null;
  }
}

export function loadPurposes(root, errors) {
  const purposes = readJson(join(root, 'tags/purposes.json'), errors) ?? [];
  const valid = Array.isArray(purposes) && purposes.every((purpose) => ID_PATTERN.test(purpose?.id ?? '') && typeof purpose.label === 'string' && purpose.label.trim());
  if (!valid || new Set(purposes.map((purpose) => purpose.id)).size !== purposes.length) {
    errors.push('tags/purposes.json must list unique purposes with an id and a label');
    return [];
  }
  return purposes;
}

function checkDeployment(record, ids, seen, where, errors) {
  const fields = Object.keys(record ?? {}).sort().join();
  if (fields !== 'id,release,revision,url') errors.push(`${where} must have exactly id, revision, url and release`);
  else if (!ids.has(record.id)) errors.push(`${where} names ${record.id}, which is not an item`);
  else if (seen.has(record.id)) errors.push(`${where} repeats the record of ${record.id}`);
  else if (!REVISION_PATTERN.test(record.revision)) errors.push(`${where}.revision must be a full revision`);
  else if (record.url !== marketUrl(record.id)) errors.push(`${where}.url must be ${marketUrl(record.id)}`);
  else if (typeof record.release !== 'string' || !RELEASE_PATTERN.test(record.release)) errors.push(`${where}.release must be a release reference without a path`);
  else seen.add(record.id);
}

export function loadCollection(root) {
  const errors = [];
  const purposes = loadPurposes(root, errors);
  const purposeIds = purposes.map((purpose) => purpose.id);
  const entries = [];
  const ids = new Map();
  const sources = new Map();

  const entriesDir = join(root, 'entries');
  const hasEntries = existsSync(entriesDir) && !lstatSync(entriesDir).isSymbolicLink();
  if (existsSync(entriesDir) && !hasEntries) errors.push('entries must be a directory, not a symbolic link');
  const names = hasEntries ? readdirSync(entriesDir).sort() : [];
  for (const name of names) {
    const dir = join(entriesDir, name);
    if (!lstatSync(dir).isDirectory()) {
      errors.push(`entries/${name} must be a directory`);
      continue;
    }
    const result = loadEntry(dir, purposeIds);
    errors.push(...result.errors.map((message) => `entries/${name}: ${message}`));
    if (!result.entry) continue;
    if (result.entry.id !== name) errors.push(`entries/${name}: id ${result.entry.id} does not match the directory`);
    const key = sourceKey(result.entry.source);
    for (const [seen, value, label] of [[ids, result.entry.id, 'id'], [sources, key, 'source']]) {
      if (value && seen.has(value)) errors.push(`entries/${name}: duplicate ${label} ${value} (also ${seen.get(value)})`);
      else if (value) seen.set(value, name);
    }
    entries.push(result.entry);
  }

  const deploymentsPath = join(root, 'deployments.json');
  const deployments = existsSync(deploymentsPath) ? readJson(deploymentsPath, errors) ?? [] : [];
  if (!Array.isArray(deployments)) errors.push('deployments.json must be a list');
  const seen = new Set();
  const itemIds = new Set(entries.map((entry) => entry.id));
  const records = Array.isArray(deployments) ? deployments : [];
  records.forEach((record, index) => checkDeployment(record, itemIds, seen, `deployments.json[${index}]`, errors));

  return { purposes, entries, deployments: records, errors };
}

export function linkState(entry, deployments) {
  const record = deployments.find((candidate) => candidate.id === entry.id);
  if (!record) return 'none';
  return record.revision === entry.revision ? 'live' : 'stale';
}

export function countPurposes(purposes, entries) {
  const unique = new Map(entries.map((entry) => [entry.id, entry]));
  const counts = purposes.map(({ id, label }) => ({ id, label, count: [...unique.values()].filter((entry) => entry.purposes.includes(id)).length }));
  return { total: unique.size, counts };
}
