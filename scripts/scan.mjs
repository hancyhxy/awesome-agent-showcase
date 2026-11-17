import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CONTENT_RULES = [
  ['personal path', /\/(?:Users|home)\/[\w.-]+\/|[A-Za-z]:\\Users\\|\/private\/var\/|\/var\/folders\//],
  ['agent workspace', /\.pi[-]cron|\.pi\/agent|sessions\/--/],
  ['credential', /\bgh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|\bsk-[A-Za-z0-9_-]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['credential assignment', /(?:api[_-]?key|secret|token|passw(?:or)?d)["']?\s*[:=]\s*["']?[A-Za-z0-9/+_.-]{16,}/i],
  ['bearer token', /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/],
  ['session record', /"type"\s*:\s*"session"/],
];
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PUBLIC_ADDRESS = 'support@heyatu.com';
const NOREPLY_DOMAIN = 'users.noreply.github.com';
const isPrivateAddress = (address) => address !== PUBLIC_ADDRESS && !address.endsWith(`@${NOREPLY_DOMAIN}`);
const PATH_RULES = [
  ['private export file', /\.(?:jsonl|har|sqlite3?|db|pem|p12|key)$/i],
  ['environment file', /(?:^|\/)\.env(?:\.|$)/],
  ['private export directory', /(?:^|\/)(?:topics|output|exports|raw|private)\//],
  ['system file', /(?:^|\/)\.DS_Store$/],
];
const SKIPPED = new Set(['.git', 'node_modules']);

export function scanPath(path) {
  return PATH_RULES.filter(([, pattern]) => pattern.test(path)).map(([rule]) => ({ where: path, rule }));
}

export function scanText(where, text) {
  const findings = [];
  text.split('\n').forEach((line, index) => {
    for (const [rule, pattern] of CONTENT_RULES) if (pattern.test(line)) findings.push({ where: `${where}:${index + 1}`, rule });
    if ((line.match(EMAIL) ?? []).some(isPrivateAddress)) findings.push({ where: `${where}:${index + 1}`, rule: 'email address' });
  });
  return findings;
}

function* walk(root, relative = '') {
  for (const name of readdirSync(join(root, relative)).sort()) {
    if (SKIPPED.has(name)) continue;
    const path = relative ? `${relative}/${name}` : name;
    const info = lstatSync(join(root, path));
    if (info.isDirectory()) yield* walk(root, path);
    else yield [path, info];
  }
}

export function scanTree(root) {
  const findings = [];
  for (const [path, info] of walk(root)) {
    findings.push(...scanPath(path));
    if (info.isSymbolicLink()) findings.push({ where: path, rule: 'symbolic link' });
    else {
      const bytes = readFileSync(join(root, path));
      if (!bytes.subarray(0, 8000).includes(0)) findings.push(...scanText(path, bytes.toString('utf8')));
    }
  }
  return findings;
}

const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });

export function scanHistory(root) {
  const findings = [];
  const paths = new Set(git(root, 'log', '--all', '--name-only', '--format=').split('\n').filter(Boolean));
  for (const path of paths) findings.push(...scanPath(path));
  for (const identity of new Set(git(root, 'log', '--all', '--format=%ae%n%ce').split('\n').filter(Boolean))) {
    if (!identity.endsWith('@users.noreply.github.com')) findings.push({ where: 'commit identity', rule: 'email address' });
  }
  findings.push(...scanText('history', git(root, 'log', '--all', '-p', '--no-color', '--format=%B')));
  return findings;
}
