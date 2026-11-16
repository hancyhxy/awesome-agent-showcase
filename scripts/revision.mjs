import { createHash } from 'node:crypto';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const members = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${members.join(',')}}`;
  }
  return JSON.stringify(value);
}

export function revisionOf(entry, files) {
  const content = { ...entry };
  delete content.revision;
  const parts = new Map(files);
  parts.set('entry.json', Buffer.from(canonicalJson(content)));
  const manifest = [...parts]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, bytes]) => `${sha256(bytes)}  ${name}\n`)
    .join('');
  return `sha256:${sha256(manifest)}`;
}
