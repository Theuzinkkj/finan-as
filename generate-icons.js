'use strict';
// Gera icon-192.png e icon-512.png para o Atlas usando apenas Node.js built-ins.

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── CRC32 ─────────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const lenBuf  = Buffer.allocUnsafe(4); lenBuf.writeUInt32BE(data.length);
  const crcBuf  = Buffer.allocUnsafe(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// ── Point-in-polygon (ray casting) ───────────────────────────────────────────
function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if (((yi > py) !== (yj > py)) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ── Hex color → [r, g, b] ────────────────────────────────────────────────────
function hex(h) {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ── Lerp ─────────────────────────────────────────────────────────────────────
function lerp(a, b, t) { return Math.round(a + (b - a) * t); }

// ── Render PNG ───────────────────────────────────────────────────────────────
function renderIcon(size) {
  const s = size;
  const raw = Buffer.allocUnsafe(s * (1 + s * 4));

  // Background: radial gradient from #7c3aed (center) to #1e1448 (edges)
  const bgInner = hex('#7c3aed');
  const bgOuter = hex('#1e1448');

  // "A" polygon scaled to [size] — same paths as icon-512.svg scaled to [size/512]
  const k = s / 512;
  const outerA = [
    [256*k, 96*k], [400*k, 432*k], [344*k, 432*k],
    [312*k, 328*k],[200*k, 328*k], [168*k, 432*k], [112*k, 432*k],
  ];
  // Crossbar hole (even-odd) — inner triangle forms the counter of "A"
  const innerA = [
    [256*k, 160*k], [312*k, 328*k], [200*k, 328*k],
  ];

  // Rounded-square mask (rx=112 scaled)
  const rx = 112 * k;

  for (let y = 0; y < s; y++) {
    const row = y * (1 + s * 4);
    raw[row] = 0; // filter: None

    for (let x = 0; x < s; x++) {
      const off = row + 1 + x * 4;

      // Rounded rect clip
      const inCornerTL = x < rx && y < rx && Math.hypot(x - rx, y - rx) > rx;
      const inCornerTR = x > s-rx && y < rx && Math.hypot(x - (s-rx), y - rx) > rx;
      const inCornerBL = x < rx && y > s-rx && Math.hypot(x - rx, y - (s-rx)) > rx;
      const inCornerBR = x > s-rx && y > s-rx && Math.hypot(x - (s-rx), y - (s-rx)) > rx;

      if (inCornerTL || inCornerTR || inCornerBL || inCornerBR) {
        raw[off] = raw[off+1] = raw[off+2] = raw[off+3] = 0; // transparent
        continue;
      }

      // Background radial gradient
      const dx = (x - s/2) / (s/2);
      const dy = (y - s/2) / (s/2);
      const dist = Math.min(1, Math.sqrt(dx*dx + dy*dy));
      raw[off]   = lerp(bgInner[0], bgOuter[0], dist);
      raw[off+1] = lerp(bgInner[1], bgOuter[1], dist);
      raw[off+2] = lerp(bgInner[2], bgOuter[2], dist);
      raw[off+3] = 255;

      // Draw white "A" using even-odd rule
      const inOuter = pointInPolygon(x, y, outerA);
      const inInner = pointInPolygon(x, y, innerA);
      if (inOuter && !inInner) {
        raw[off] = raw[off+1] = raw[off+2] = 242; // #f2f2f2
        raw[off+3] = 255;
      }
    }
  }

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(s, 0); ihdr.writeUInt32BE(s, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = ihdr[11] = ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = path.join(__dirname, 'frontend');
fs.writeFileSync(path.join(out, 'icon-192.png'), renderIcon(192));
fs.writeFileSync(path.join(out, 'icon-512.png'), renderIcon(512));
console.log('✓ icon-192.png e icon-512.png gerados em frontend/');
