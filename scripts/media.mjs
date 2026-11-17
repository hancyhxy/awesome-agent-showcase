export const QUOTED_MAX_MS = 8000;
export const QUOTED_MAX_BYTES = 2 * 1024 * 1024;
export const QUOTED_EXTENSIONS = ['gif', 'webp', 'mp4'];

const MIN_FRAME_MS = 100;
const SHORT_FRAME_MS = 10;
const frameMs = (ms) => (ms <= SHORT_FRAME_MS ? MIN_FRAME_MS : ms);

function skipSubBlocks(bytes, start) {
  let pos = start;
  while (pos < bytes.length) {
    const size = bytes[pos++];
    if (size === 0) return pos;
    pos += size;
  }
  return null;
}

function gifDurationMs(bytes) {
  const signature = bytes.toString('latin1', 0, 6);
  if (bytes.length < 14 || (signature !== 'GIF87a' && signature !== 'GIF89a')) return null;
  let pos = 13;
  if (bytes[10] & 0x80) pos += 3 << ((bytes[10] & 7) + 1);
  let total = 0;
  let delay = 0;
  while (pos < bytes.length) {
    const tag = bytes[pos++];
    if (tag === 0x3b) return total;
    if (tag === 0x21) {
      const label = bytes[pos++];
      if (label === 0xf9 && bytes[pos] === 4 && pos + 4 < bytes.length) delay = bytes.readUInt16LE(pos + 2) * 10;
      pos = skipSubBlocks(bytes, pos);
    } else if (tag === 0x2c) {
      if (pos + 9 > bytes.length) return null;
      const flags = bytes[pos + 8];
      pos += 9;
      if (flags & 0x80) pos += 3 << ((flags & 7) + 1);
      pos = skipSubBlocks(bytes, pos + 1);
      total += frameMs(delay);
      delay = 0;
    } else return null;
    if (pos === null) return null;
  }
  return null;
}

function webpDurationMs(bytes) {
  if (bytes.length < 12 || bytes.toString('latin1', 0, 4) !== 'RIFF' || bytes.toString('latin1', 8, 12) !== 'WEBP') return null;
  let pos = 12;
  let total = 0;
  while (pos + 8 <= bytes.length) {
    const name = bytes.toString('latin1', pos, pos + 4);
    const size = bytes.readUInt32LE(pos + 4);
    const next = pos + 8 + size + (size % 2);
    if (pos + 8 + size > bytes.length) return null;
    if (name === 'ANMF') {
      if (size < 16) return null;
      total += frameMs(bytes.readUIntLE(pos + 8 + 12, 3));
    }
    pos = next;
  }
  return total;
}

function mp4Boxes(bytes, start, end) {
  const boxes = [];
  let pos = start;
  while (pos + 8 <= end) {
    let size = bytes.readUInt32BE(pos);
    let header = 8;
    if (size === 1) {
      if (pos + 16 > end) return null;
      size = Number(bytes.readBigUInt64BE(pos + 8));
      header = 16;
    } else if (size === 0) size = end - pos;
    if (size < header || pos + size > end) return null;
    boxes.push({ name: bytes.toString('latin1', pos + 4, pos + 8), start: pos + header, end: pos + size });
    pos += size;
  }
  return boxes;
}

function mp4DurationMs(bytes) {
  const top = mp4Boxes(bytes, 0, bytes.length);
  if (!top || top[0]?.name !== 'ftyp') return null;
  const moov = top.find((box) => box.name === 'moov');
  const mvhd = moov && mp4Boxes(bytes, moov.start, moov.end)?.find((box) => box.name === 'mvhd');
  if (!mvhd) return null;
  const version = bytes[mvhd.start];
  const fields = version === 1 ? { timescale: 20, duration: 24, length: 32 } : version === 0 ? { timescale: 12, duration: 16, length: 20 } : null;
  if (!fields || mvhd.end - mvhd.start < fields.length) return null;
  const timescale = bytes.readUInt32BE(mvhd.start + fields.timescale);
  const duration = version === 1 ? Number(bytes.readBigUInt64BE(mvhd.start + fields.duration)) : bytes.readUInt32BE(mvhd.start + fields.duration);
  return timescale > 0 ? Math.round((duration * 1000) / timescale) : null;
}

export function durationMs(path, bytes) {
  const extension = path.slice(path.lastIndexOf('.') + 1);
  if (extension === 'gif') return gifDurationMs(bytes);
  if (extension === 'webp') return webpDurationMs(bytes);
  if (extension === 'mp4') return mp4DurationMs(bytes);
  return null;
}
