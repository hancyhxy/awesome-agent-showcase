import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { durationMs } from '../scripts/media.mjs';
import { gifBytes, mp4Bytes, webpBytes } from './fixture.mjs';

describe('media length', () => {
  it('adds the frame delays of a GIF and counts a delay of 0 or 1 as 100 ms', () => {
    assert.equal(durationMs('media/a.gif', gifBytes([50, 50, 100])), 2000);
    assert.equal(durationMs('media/a.gif', gifBytes([0, 1, 2])), 220);
    assert.equal(durationMs('media/a.gif', gifBytes([])), 0);
  });

  it('adds the frame durations of an animated WebP and gives 0 for a still WebP', () => {
    assert.equal(durationMs('media/a.webp', webpBytes([500, 1500, 20])), 2020);
    assert.equal(durationMs('media/a.webp', webpBytes([0, 5])), 200);
    assert.equal(durationMs('media/a.webp', webpBytes([])), 0);
  });

  it('reads the movie header of an MP4', () => {
    assert.equal(durationMs('media/a.mp4', mp4Bytes(4)), 4000);
    assert.equal(durationMs('media/a.mp4', mp4Bytes(7.5, 600)), 7500);
  });

  it('returns null for a file that cannot be read', () => {
    assert.equal(durationMs('media/a.gif', Buffer.from('SYNTHETIC TEST ASSET')), null);
    assert.equal(durationMs('media/a.gif', gifBytes([10]).subarray(0, 30)), null);
    assert.equal(durationMs('media/a.webp', webpBytes([10]).subarray(0, 40)), null);
    assert.equal(durationMs('media/a.webp', Buffer.from('RIFF....WEBX')), null);
    assert.equal(durationMs('media/a.mp4', Buffer.from('synthetic ftypisom')), null);
    assert.equal(durationMs('media/a.mp4', mp4Bytes(4).subarray(0, 40)), null);
    assert.equal(durationMs('media/a.mp4', mp4Bytes(4).subarray(16)), null);
    assert.equal(durationMs('media/a.png', Buffer.from('x')), null);
  });

  it('does not loop or read outside a short file', () => {
    assert.equal(durationMs('media/a.gif', Buffer.from('GIF89a')), null);
    assert.equal(durationMs('media/a.gif', Buffer.concat([gifBytes([]).subarray(0, 13), Buffer.from([0x21, 0xf9, 0x04])])), null);
    assert.equal(durationMs('media/a.webp', Buffer.alloc(0)), null);
    assert.equal(durationMs('media/a.mp4', Buffer.alloc(3)), null);
  });
});
