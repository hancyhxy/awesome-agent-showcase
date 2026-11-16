import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { revisionOf } from './revision.mjs';

export const ID_PATTERN = /^[a-z0-9-]{1,32}$/;
export const REVISION_PATTERN = /^sha256:[0-9a-f]{64}$/;
export const MARKET_ORIGIN = 'https://heyatu.com';
export const marketUrl = (id) => `${MARKET_ORIGIN}/market/${id}`;

const ASSET_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm'];
const ASSET_PATH = new RegExp(`^media/[a-z0-9][a-z0-9._-]{0,63}\\.(${ASSET_EXTENSIONS.join('|')})$`);
const CHOICE_PATTERN = /^[a-z0-9-]{1,32}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const X_POST_PATH = /^\/[A-Za-z0-9_]{1,15}\/status\/(\d{1,19})$/;
const EXECUTABLE_MARKUP = /<\s*(script|iframe|object|embed|style)\b|javascript:|<[^>]*\son[a-z]+\s*=/i;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b-\u001f\u007f]/;
const PRIVATE_HOST = /^(localhost|.*\.(local|localhost|internal|lan))$|^[\d.]+$|:/;

const TOP_LEVEL = ['id', 'title', 'summary', 'purposes', 'source', 'rights', 'media', 'prompts', 'requirements', 'tags', 'revision'];
const REQUIRED = ['id', 'title', 'summary', 'purposes', 'source', 'rights', 'media', 'requirements', 'revision'];
const SOURCE_FIELDS = {
  'x-post': ['type', 'url', 'author', 'credit', 'publishedAt', 'capturedAt'],
  'package-docs': ['type', 'url', 'package', 'credit', 'capturedAt'],
};
const RIGHTS_FIELDS = {
  original: ['path', 'basis'],
  licensed: ['path', 'basis', 'holder', 'licence', 'licenceUrl'],
  permission: ['path', 'basis', 'holder', 'grantedOn'],
};

export function parseHttpsUrl(value) {
  if (typeof value !== 'string' || value.length > 300 || /\s/.test(value)) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const safe = url.protocol === 'https:' && !url.username && !url.password && !url.port
    && url.hostname.includes('.') && !PRIVATE_HOST.test(url.hostname);
  return safe ? url : null;
}

export function xPostId(source) {
  const url = parseHttpsUrl(source?.url);
  const onX = url && ['x.com', 'twitter.com'].includes(url.hostname) && !url.search && !url.hash;
  return onX ? X_POST_PATH.exec(url.pathname)?.[1] ?? null : null;
}

export function sourceKey(source) {
  if (source?.type === 'x-post') {
    const postId = xPostId(source);
    return postId && `x:${postId}`;
  }
  const url = parseHttpsUrl(source?.url);
  return url && `docs:${url.hostname}${url.pathname.replace(/\/+$/, '')}`;
}

function isDate(value) {
  return typeof value === 'string' && DATE_PATTERN.test(value)
    && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
}

function checkObject(value, allowed, where, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${where} must be an object`);
    return false;
  }
  for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(`${where}.${key} is not allowed`);
  return true;
}

function checkText(value, where, errors, { max, multiline = false } = {}) {
  const ok = typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max
    && !CONTROL_CHARACTERS.test(value) && (multiline || !/[\r\n]/.test(value));
  if (!ok) errors.push(`${where} must be trimmed text of 1 to ${max} characters${multiline ? '' : ' on one line'}`);
  return ok;
}

function checkUrl(value, where, errors) {
  if (!parseHttpsUrl(value)) errors.push(`${where} must be a public https URL without credentials`);
}

function checkDate(value, where, errors) {
  if (!isDate(value)) errors.push(`${where} must be a date as YYYY-MM-DD`);
}

function checkList(value, where, errors, max) {
  if (!Array.isArray(value) || value.length > max) {
    errors.push(`${where} must be a list of at most ${max}`);
    return [];
  }
  return value;
}

function checkSource(entry, errors) {
  const { source, id } = entry;
  const fields = SOURCE_FIELDS[source?.type];
  if (!fields) {
    errors.push('source.type must be x-post or package-docs');
    return;
  }
  if (!checkObject(source, fields, 'source', errors)) return;
  for (const field of fields.filter((name) => name !== 'type')) {
    if (field.endsWith('At')) checkDate(source[field], `source.${field}`, errors);
    else if (field === 'url') checkUrl(source.url, 'source.url', errors);
    else checkText(source[field], `source.${field}`, errors, { max: 200 });
  }
  if (source.type === 'x-post') {
    const postId = xPostId(source);
    if (!postId) errors.push('source.url must be https://x.com/<handle>/status/<id> without query');
    else if (id !== `x-${postId}`) errors.push(`id must be x-${postId} for this source`);
  } else if (!/^tool-[a-z0-9-]+$/.test(id ?? '')) {
    errors.push('id of a package-docs item must start with tool-');
  }
}

function checkRights(entry, errors) {
  const assets = checkList(entry.rights?.assets, 'rights.assets', errors, 100);
  checkObject(entry.rights, ['assets'], 'rights', errors);
  const seen = new Set();
  for (const [index, asset] of assets.entries()) {
    const where = `rights.assets[${index}]`;
    const fields = RIGHTS_FIELDS[asset?.basis];
    if (!fields) errors.push(`${where}.basis must be original, licensed or permission`);
    else if (checkObject(asset, fields, where, errors)) {
      for (const field of fields.filter((name) => name !== 'path' && name !== 'basis')) {
        if (field === 'licenceUrl') checkUrl(asset[field], `${where}.${field}`, errors);
        else if (field === 'grantedOn') checkDate(asset[field], `${where}.${field}`, errors);
        else checkText(asset[field], `${where}.${field}`, errors, { max: 200 });
      }
    }
    if (!ASSET_PATH.test(asset?.path ?? '')) errors.push(`${where}.path must be media/<name> with a supported extension`);
    else if (seen.has(asset.path)) errors.push(`${where}.path ${asset.path} is repeated`);
    else seen.add(asset.path);
  }
  return seen;
}

function checkMedia(entry, errors) {
  const seen = new Set();
  for (const [index, item] of checkList(entry.media, 'media', errors, 100).entries()) {
    const where = `media[${index}]`;
    if (!checkObject(item, ['path', 'alt'], where, errors)) continue;
    checkText(item.alt, `${where}.alt`, errors, { max: 300 });
    if (!ASSET_PATH.test(item.path ?? '')) errors.push(`${where}.path must be media/<name> with a supported extension`);
    else if (seen.has(item.path)) errors.push(`${where}.path ${item.path} is repeated`);
    else seen.add(item.path);
  }
  return seen;
}

function checkPrompts(entry, errors) {
  const choices = new Set();
  for (const [index, prompt] of checkList(entry.prompts ?? [], 'prompts', errors, 20).entries()) {
    const where = `prompts[${index}]`;
    if (!checkObject(prompt, ['choice', 'status', 'text', 'label', 'testedOn'], where, errors)) continue;
    if (!CHOICE_PATTERN.test(prompt.choice ?? '')) errors.push(`${where}.choice must be lowercase letters, digits and hyphens`);
    else if (choices.has(prompt.choice)) errors.push(`${where}.choice ${prompt.choice} is repeated`);
    else choices.add(prompt.choice);
    if (!['original', 'proposed', 'tested'].includes(prompt.status)) errors.push(`${where}.status must be original, proposed or tested`);
    checkText(prompt.text, `${where}.text`, errors, { max: 4000, multiline: true });
    if (prompt.label !== undefined) checkText(prompt.label, `${where}.label`, errors, { max: 80 });
    if (prompt.status === 'tested') checkDate(prompt.testedOn, `${where}.testedOn`, errors);
    else if (prompt.testedOn !== undefined) errors.push(`${where}.testedOn is only for tested prompts`);
  }
}

function checkTags(entry, errors) {
  for (const [index, tag] of checkList(entry.tags ?? [], 'tags', errors, 20).entries()) {
    const where = `tags[${index}]`;
    if (!checkObject(tag, ['kind', 'name', 'version', 'evidence'], where, errors)) continue;
    if (!['tool', 'model'].includes(tag.kind)) errors.push(`${where}.kind must be tool or model`);
    checkText(tag.name, `${where}.name`, errors, { max: 80 });
    if (tag.version !== undefined) checkText(tag.version, `${where}.version`, errors, { max: 40 });
    checkUrl(tag.evidence, `${where}.evidence`, errors);
  }
}

function checkFields(entry, purposeIds, errors) {
  if (!checkObject(entry, TOP_LEVEL, 'entry', errors)) return false;
  for (const field of REQUIRED) if (!(field in entry)) errors.push(`${field} is required`);
  if (!ID_PATTERN.test(entry.id ?? '')) errors.push('id must be 1 to 32 lowercase letters, digits and hyphens');
  checkText(entry.title, 'title', errors, { max: 120 });
  checkText(entry.summary, 'summary', errors, { max: 280 });
  const purposes = checkList(entry.purposes, 'purposes', errors, purposeIds.length);
  if (purposes.length === 0) errors.push('purposes needs at least one purpose');
  if (new Set(purposes).size !== purposes.length) errors.push('purposes must not repeat');
  for (const purpose of purposes) if (!purposeIds.includes(purpose)) errors.push(`purposes: unknown purpose ${JSON.stringify(purpose)}`);
  for (const [index, line] of checkList(entry.requirements, 'requirements', errors, 20).entries()) checkText(line, `requirements[${index}]`, errors, { max: 200 });
  checkSource(entry, errors);
  checkPrompts(entry, errors);
  checkTags(entry, errors);
  return true;
}

function readEntryFiles(dir, errors) {
  const files = new Map();
  const names = readdirSync(dir);
  for (const name of names) {
    const info = lstatSync(join(dir, name));
    if (info.isSymbolicLink()) errors.push(`${name} is a symbolic link`);
    else if (name === 'media' && info.isDirectory()) continue;
    else if (name === 'body.md' && info.isFile()) files.set(name, readFileSync(join(dir, name)));
    else if (name !== 'entry.json' || !info.isFile()) errors.push(`${name} is not allowed in an entry`);
  }
  if (!files.has('body.md') && !names.includes('body.md')) errors.push('body.md is required');
  if (!names.includes('media') || lstatSync(join(dir, 'media')).isSymbolicLink()) return files;
  for (const name of readdirSync(join(dir, 'media'))) {
    const path = `media/${name}`;
    const info = lstatSync(join(dir, path));
    if (info.isSymbolicLink()) errors.push(`${path} is a symbolic link`);
    else if (!info.isFile() || !ASSET_PATH.test(path)) errors.push(`${path} is not a supported asset`);
    else files.set(path, readFileSync(join(dir, path)));
  }
  return files;
}

export function loadEntry(dir, purposeIds) {
  const errors = [];
  let entry;
  try {
    entry = JSON.parse(readFileSync(join(dir, 'entry.json'), 'utf8'));
  } catch (error) {
    return { entry: null, errors: [`entry.json cannot be read: ${error.code ?? error.message}`] };
  }
  const files = readEntryFiles(dir, errors);
  if (!checkFields(entry, purposeIds, errors)) return { entry, errors };

  const body = files.get('body.md')?.toString('utf8');
  if (body !== undefined && body.trim() === '') errors.push('body.md must not be empty');
  if (body !== undefined && EXECUTABLE_MARKUP.test(body)) errors.push('body.md must not contain executable markup');

  const stored = new Set([...files.keys()].filter((name) => name.startsWith('media/')));
  const licensed = checkRights(entry, errors);
  const referenced = checkMedia(entry, errors);
  for (const path of stored) if (!licensed.has(path)) errors.push(`${path} is stored without a rights record`);
  for (const path of licensed) if (!stored.has(path)) errors.push(`${path} has a rights record but no file`);
  for (const path of referenced) {
    if (!stored.has(path)) errors.push(`${path} is referenced but missing`);
    if (!licensed.has(path)) errors.push(`${path} is referenced without a rights record`);
  }

  const revision = revisionOf(entry, files);
  if (!REVISION_PATTERN.test(entry.revision ?? '')) errors.push('revision must be sha256:<64 hex characters>');
  else if (entry.revision !== revision) errors.push(`revision is stale; computed ${revision}`);
  return { entry, errors, revision };
}
