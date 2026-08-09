#!/usr/bin/env node
// Generates PWA icons from scratch (no external assets, no network calls):
// a black rounded-square background with a blocky gold "E" monogram, in
// Purdue's black/old-gold palette. Hand-rolls a minimal PNG encoder (Node's
// zlib for the deflate stream, a standard CRC32) so there's no dependency
// on a canvas/image library.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'icons');
mkdirSync(OUT_DIR, { recursive: true });

const BLACK = [13, 13, 13, 255];
const GOLD = [207, 185, 145, 255];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth
  ihdrData.writeUInt8(6, 9); // color type RGBA
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);
  const ihdr = chunk('IHDR', ihdrData);

  // Raw scanlines: filter byte 0 (None) + width*4 RGBA bytes, per row.
  const raw = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = rgba[y * width + x];
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
      raw[offset++] = a;
    }
  }
  const idat = chunk('IDAT', deflateSync(raw));
  const iend = chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

// Classic 5x7 blocky "E" bitmap font.
const GLYPH_E = [
  '11111',
  '10000',
  '10000',
  '11110',
  '10000',
  '10000',
  '11111',
];

function buildIcon(size, { maskable = false } = {}) {
  const pixels = new Array(size * size).fill(BLACK);
  const cx = size / 2;
  const cy = size / 2;

  // Rounded corners for the non-maskable variants (maskable must stay full
  // bleed -- the OS applies its own mask shape on top).
  if (!maskable) {
    const radius = size * 0.22;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!inRoundedSquare(x, y, size, radius)) pixels[y * size + x] = [0, 0, 0, 0];
      }
    }
  }

  // Glyph safe zone: maskable icons need the important content within the
  // center ~80% diameter circle, so shrink the glyph more for that variant.
  const glyphBoxRatio = maskable ? 0.42 : 0.56;
  const cols = GLYPH_E[0].length;
  const rows = GLYPH_E.length;
  const cellSize = (size * glyphBoxRatio) / Math.max(cols, rows);
  const glyphW = cellSize * cols;
  const glyphH = cellSize * rows;
  const startX = cx - glyphW / 2;
  const startY = cy - glyphH / 2;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (GLYPH_E[r][c] !== '1') continue;
      const x0 = Math.round(startX + c * cellSize);
      const y0 = Math.round(startY + r * cellSize);
      const x1 = Math.round(startX + (c + 1) * cellSize);
      const y1 = Math.round(startY + (r + 1) * cellSize);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (x >= 0 && x < size && y >= 0 && y < size) pixels[y * size + x] = GOLD;
        }
      }
    }
  }

  return pixels;
}

function inRoundedSquare(x, y, size, radius) {
  const inLeft = x < radius;
  const inRight = x >= size - radius;
  const inTop = y < radius;
  const inBottom = y >= size - radius;
  if ((inLeft || inRight) && (inTop || inBottom)) {
    const cx = inLeft ? radius : size - radius;
    const cy = inTop ? radius : size - radius;
    const dx = x - cx + 0.5;
    const dy = y - cy + 0.5;
    return dx * dx + dy * dy <= radius * radius;
  }
  return true;
}

function writeIcon(filename, size, opts) {
  const pixels = buildIcon(size, opts);
  writeFileSync(path.join(OUT_DIR, filename), encodePNG(size, size, pixels));
  console.log(`Wrote ${filename} (${size}x${size})`);
}

writeIcon('icon-192.png', 192);
writeIcon('icon-512.png', 512);
writeIcon('icon-maskable-512.png', 512, { maskable: true });
writeIcon('apple-touch-icon.png', 180);
