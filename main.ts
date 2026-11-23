// The World in One Day — Monday, 23 November 2026.
// A newspaper front page drawn by code: own PNG encoder, own 5x7 bitmap font.
// Node 22 standard library only. No network, no randomness, no clock:
// two runs write byte-identical output.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;
const img = new Uint8Array(W * H * 3);

const PAPER = '#F7F5F0';
const NAVY = '#0B2545';
const GOLD = '#C9A227';
const GOLDL = '#F2C14E';
const INK = '#1A1A1A';
const GREY = '#6B7280';
const CELLBORDER = '#D8D2C4';
const LEADBG = '#0E3B2E';
const WHITE = '#FFFFFF';

function rgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function setPx(x: number, y: number, c: [number, number, number]): void {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  img[i] = c[0];
  img[i + 1] = c[1];
  img[i + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, hex: string): void {
  const c = rgb(hex);
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) setPx(xx, yy, c);
  }
}

function rect(x: number, y: number, w: number, h: number, hex: string, t: number): void {
  fillRect(x, y, w, t, hex);
  fillRect(x, y + h - t, w, t, hex);
  fillRect(x, y, t, h, hex);
  fillRect(x + w - t, y, t, h, hex);
}

// Bresenham line, thickness t (square brush).
function line(x0: number, y0: number, x1: number, y1: number, hex: string, t: number): void {
  const c = rgb(hex);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  const half = Math.floor(t / 2);
  for (;;) {
    for (let a = -half; a <= half; a++) {
      for (let b = -half; b <= half; b++) setPx(x + a, y + b, c);
    }
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function fillCircle(cx: number, cy: number, r: number, hex: string): void {
  const c = rgb(hex);
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y));
    for (let x = -half; x <= half; x++) setPx(cx + x, cy + y, c);
  }
}

// Circle outline, thickness t: plot rings.
function circle(cx: number, cy: number, r: number, hex: string, t: number): void {
  const c = rgb(hex);
  const steps = Math.max(64, r * 8);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * r);
    const y = Math.round(cy + Math.sin(a) * r);
    const half = Math.floor(t / 2);
    for (let a2 = -half; a2 <= half; a2++) {
      for (let b2 = -half; b2 <= half; b2++) setPx(x + a2, y + b2, c);
    }
  }
}

// Filled triangle by scanline.
function fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, hex: string): void {
  const c = rgb(hex);
  const minY = Math.max(0, Math.min(y0, y1, y2));
  const maxY = Math.min(H - 1, Math.max(y0, y1, y2));
  const edge = (xa: number, ya: number, xb: number, yb: number, y: number): number | null => {
    if (y < Math.min(ya, yb) || y > Math.max(ya, yb)) return null;
    if (ya === yb) return xa;
    return xa + ((y - ya) * (xb - xa)) / (yb - ya);
  };
  for (let y = minY; y <= maxY; y++) {
    const xs = [
      edge(x0, y0, x1, y1, y),
      edge(x1, y1, x2, y2, y),
      edge(x2, y2, x0, y0, y),
    ].filter((v): v is number => v !== null);
    if (xs.length < 2) continue;
    const lo = Math.max(0, Math.floor(Math.min(...xs)));
    const hi = Math.min(W - 1, Math.ceil(Math.max(...xs)));
    for (let x = lo; x <= hi; x++) setPx(x, y, c);
  }
}

// ---- 5x7 bitmap font: each glyph is 7 rows of 5 bits ----
const FONT: Record<string, number[]> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  '2': [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  '3': [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0x0c, 0x0c],
  ',': [0, 0, 0, 0, 0x0c, 0x04, 0x08],
  ':': [0, 0x0c, 0x0c, 0, 0x0c, 0x0c, 0],
  ';': [0, 0x0c, 0x0c, 0, 0x0c, 0x04, 0x08],
  '!': [0x04, 0x04, 0x04, 0x04, 0x04, 0, 0x04],
  '?': [0x0e, 0x11, 0x01, 0x06, 0x04, 0, 0x04],
  '-': [0, 0, 0, 0x0e, 0, 0, 0],
  "'": [0x04, 0x04, 0x08, 0, 0, 0, 0],
  '(': [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ')': [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  '/': [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10],
  '&': [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  '+': [0, 0x04, 0x04, 0x1f, 0x04, 0x04, 0],
  '%': [0x19, 0x1a, 0x02, 0x04, 0x08, 0x0b, 0x13],
  '=': [0, 0, 0x1f, 0, 0x1f, 0, 0],
};

function drawGlyph(ch: string, x: number, y: number, scale: number, hex: string): void {
  const rows = FONT[ch] ?? FONT['?'];
  const c = rgb(hex);
  for (let r = 0; r < 7; r++) {
    for (let col = 0; col < 5; col++) {
      if ((rows[r] >> (4 - col)) & 1) {
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            setPx(x + col * scale + dx, y + r * scale + dy, c);
          }
        }
      }
    }
  }
}

function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale;
}

// align: 'l' left at x, 'c' centred on x.
function drawText(x: number, y: number, s: string, scale: number, hex: string, align: 'l' | 'c' = 'l'): void {
  let sx = x;
  if (align === 'c') sx = x - Math.floor(textWidth(s, scale) / 2);
  for (let i = 0; i < s.length; i++) {
    drawGlyph(s[i], sx + i * 6 * scale, y, scale, hex);
  }
}

// Greedy word wrap to lines of at most maxW pixels at the given scale.
function wrap(s: string, maxW: number, scale: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur === '' ? w : cur + ' ' + w;
    if (textWidth(next, scale) <= maxW || cur === '') {
      cur = next;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

function drawLines(x: number, y: number, lines: string[], scale: number, hex: string, lh: number): void {
  for (let i = 0; i < lines.length; i++) {
    drawText(x, y + i * lh, lines[i], scale, hex, 'l');
  }
}

// ---- pictograms (geometric, drawn in a ~64x64 box at x,y) ----

// Globe with a crack: the lead COP31 image, drawn large.
function globe(cx: number, cy: number, r: number): void {
  circle(cx, cy, r, GOLDL, 5);
  // latitude lines
  line(cx - r + 10, cy - Math.floor(r * 0.45), cx + r - 10, cy - Math.floor(r * 0.45), GOLDL, 3);
  line(cx - r + 4, cy + Math.floor(r * 0.45), cx + r - 4, cy + Math.floor(r * 0.45), GOLDL, 3);
  // meridian
  line(cx, cy - r, cx, cy + r, GOLDL, 3);
  // crack: a thick dark zigzag across the globe
  line(cx - Math.floor(r * 0.7), cy - Math.floor(r * 0.55), cx - 8, cy - 6, '#06231B', 7);
  line(cx - 8, cy - 6, cx + 14, cy + 16, '#06231B', 7);
  line(cx + 14, cy + 16, cx + Math.floor(r * 0.65), cy + Math.floor(r * 0.6), '#06231B', 7);
}

// Dymer: apartment block, top-right corner collapsed, rubble at the base.
function picDymer(x: number, y: number): void {
  fillRect(x + 8, y + 6, 48, 44, '#B42318');
  // windows
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      fillRect(x + 14 + c * 14, y + 12 + r * 10, 7, 6, GOLDL);
    }
  }
  // collapsed corner: paper-coloured bite out of the top right
  fillTriangle(x + 56, y + 6, x + 56, y + 26, x + 34, y + 6, PAPER);
  fillTriangle(x + 56, y + 26, x + 44, y + 26, x + 34, y + 6, PAPER);
  // rubble triangles at the base
  fillTriangle(x + 4, y + 54, x + 16, y + 40, x + 28, y + 54, '#7A1F14');
  fillTriangle(x + 24, y + 54, x + 36, y + 42, x + 48, y + 54, '#7A1F14');
  fillTriangle(x + 44, y + 54, x + 54, y + 44, x + 62, y + 54, '#7A1F14');
}

// Hormuz: tanker on waves with a flame.
function picTanker(x: number, y: number): void {
  // hull
  fillTriangle(x + 6, y + 34, x + 58, y + 34, x + 52, y + 48, '#C2410C');
  fillRect(x + 6, y + 34, 52, 14, '#C2410C');
  // deck + funnel
  fillRect(x + 12, y + 26, 30, 8, '#7C2D12');
  fillRect(x + 44, y + 18, 8, 16, '#7C2D12');
  // flame above the funnel
  fillTriangle(x + 42, y + 16, x + 48, y + 2, x + 54, y + 16, GOLDL);
  // waves
  line(x + 2, y + 56, x + 20, y + 52, '#1D4E89', 3);
  line(x + 22, y + 56, x + 40, y + 52, '#1D4E89', 3);
  line(x + 42, y + 56, x + 60, y + 52, '#1D4E89', 3);
}

// Merkury: warship capsized, hull tilted, smoke.
function picWarship(x: number, y: number): void {
  // tilted hull: two triangles forming a capsized hull
  fillTriangle(x + 8, y + 40, x + 56, y + 28, x + 50, y + 46, '#1D4E89');
  fillTriangle(x + 8, y + 40, x + 50, y + 46, x + 14, y + 50, '#1D4E89');
  // mast, tilted with the ship
  line(x + 34, y + 32, x + 30, y + 12, '#1D4E89', 4);
  // smoke puffs
  fillCircle(x + 20, y + 12, 6, '#9CA3AF');
  fillCircle(x + 30, y + 6, 5, '#9CA3AF');
  fillCircle(x + 40, y + 12, 6, '#9CA3AF');
  // water line
  line(x + 2, y + 56, x + 62, y + 56, '#1D4E89', 3);
}

// Democrats: capitol dome with columns.
function picDome(x: number, y: number): void {
  // dome: half circle on a base
  fillCircle(x + 32, y + 26, 16, '#2563EB');
  fillRect(x + 16, y + 26, 32, 4, PAPER);
  fillRect(x + 30, y + 6, 4, 6, '#2563EB');
  // columns
  for (let c = 0; c < 4; c++) fillRect(x + 16 + c * 10, y + 30, 5, 18, '#2563EB');
  // base
  fillRect(x + 10, y + 48, 44, 6, '#2563EB');
  // flag on top
  line(x + 32, y + 6, x + 32, y - 2, '#2563EB', 2);
}

// Poland: cruise missile, diagonal, over a shield outline.
function picMissile(x: number, y: number): void {
  // shield outline
  rect(x + 6, y + 8, 52, 46, '#475569', 3);
  // missile body, diagonal
  line(x + 16, y + 44, x + 48, y + 16, '#475569', 6);
  // nose cone
  fillTriangle(x + 48, y + 16, x + 56, y + 10, x + 52, y + 22, '#B42318');
  // fins
  fillTriangle(x + 16, y + 44, x + 10, y + 50, x + 22, y + 48, '#475569');
  fillTriangle(x + 16, y + 44, x + 12, y + 36, x + 20, y + 40, '#475569');
}

// Houthis: refinery towers with a flame.
function picRefinery(x: number, y: number): void {
  // two towers
  fillRect(x + 10, y + 22, 12, 32, '#B45309');
  fillRect(x + 30, y + 14, 12, 40, '#B45309');
  // cross pipes
  fillRect(x + 10, y + 30, 32, 4, '#7C2D12');
  fillRect(x + 10, y + 42, 32, 4, '#7C2D12');
  // tank
  fillRect(x + 46, y + 38, 14, 16, '#B45309');
  // flame on the tall tower
  fillTriangle(x + 30, y + 12, x + 36, y + 0, x + 42, y + 12, GOLDL);
}

// ---- layout ----
function build(): void {
  fillRect(0, 0, W, H, PAPER);

  // Masthead
  fillRect(0, 0, W, 96, NAVY);
  drawText(512, 27, 'THE WORLD IN ONE DAY', 6, GOLDL, 'c');
  fillRect(0, 96, W, 4, GOLD);

  // Date
  drawText(512, 120, 'MONDAY, 23 NOVEMBER 2026', 3, NAVY, 'c');
  fillRect(24, 158, 976, 2, GOLD);

  // Lead panel: COP31 collapse
  fillRect(24, 172, 976, 280, LEADBG);
  rect(24, 172, 976, 280, GOLD, 2);
  globe(170, 312, 76);
  drawText(290, 200, 'CLIMATE TALKS', 4, WHITE, 'l');
  drawText(290, 244, 'COLLAPSE', 4, WHITE, 'l');
  drawText(290, 306, 'COP31 ENDS WITH NO DEAL', 2, GOLDL, 'l');
  drawText(290, 332, '130 NATIONS REJECT A DRAFT', 2, GOLDL, 'l');
  drawText(290, 358, 'WITH NO FOSSIL FUELS', 2, GOLDL, 'l');
  drawText(290, 404, 'ANTALYA - TALKS RAN 48 HOURS OVER TIME', 2, WHITE, 'l');

  // Grid: 2 rows x 3 cols
  interface Cell {
    bar: string;
    pic: (x: number, y: number) => void;
    head: string;
    sub: string;
  }
  const cells: Cell[] = [
    { bar: '#B42318', pic: picDymer, head: 'DRONE FLATTENS FLATS NEAR KYIV', sub: 'NINE KILLED, 11 STILL MISSING IN THE RUBBLE' },
    { bar: '#C2410C', pic: picTanker, head: 'THREE TANKERS HIT IN HORMUZ', sub: 'UKMTO REPORTS STRIKES OFF OMAN, NO CASUALTIES' },
    { bar: '#1D4E89', pic: picWarship, head: 'RUSSIAN WARSHIP SINKS IN LIBYA', sub: 'SEA DRONES HIT CORVETTE MERKURY AT BENGHAZI' },
    { bar: '#2563EB', pic: picDome, head: 'DEMOCRATS WIN THE HOUSE', sub: '258 SEATS, BIGGEST SINCE 1992, AP SAYS' },
    { bar: '#475569', pic: picMissile, head: 'POLAND: MISSILES WERE RUSSIAN', sub: 'THREE KH-101S CONFIRMED; NATO TO MEET MONDAY' },
    { bar: '#B45309', pic: picRefinery, head: 'HOUTHIS CLAIM SAUDI STRIKES', sub: 'RABIGH REFINERY AND RADAR TARGETED, SAUDIS SILENT' },
  ];
  const colX = [24, 355, 686];
  const rowY = [468, 684];
  for (let i = 0; i < 6; i++) {
    const cx = colX[i % 3];
    const cy = rowY[Math.floor(i / 3)];
    const cell = cells[i];
    fillRect(cx, cy, 314, 200, WHITE);
    rect(cx, cy, 314, 200, CELLBORDER, 2);
    fillRect(cx, cy, 314, 10, cell.bar);
    cell.pic(cx + 16, cy + 22);
    const headLines = wrap(cell.head, 290, 3);
    drawLines(cx + 12, cy + 96, headLines, 3, INK, 23);
    const subLines = wrap(cell.sub, 290, 2);
    drawLines(cx + 12, cy + 150, subLines, 2, GREY, 15);
  }

  // Also today strip
  fillRect(24, 900, 976, 2, GOLD);
  drawText(
    512,
    916,
    'ALSO TODAY: MARKETS PLUNGE - KILLER-ROBOT TALKS AGREED - BEPICOLOMBO AT MERCURY',
    2,
    NAVY,
    'c',
  );

  // Footer
  drawText(512, 956, 'SOURCES: AP - BBC - REUTERS', 2, GREY, 'c');
}

// ---- PNG encoder (own CRC32 + zlib deflate, deterministic) ----
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]));
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}

function encodePNG(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    Buffer.from(img.buffer, y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
build();
writeFileSync(join(outDir, 'entry.png'), encodePNG());
