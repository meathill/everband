// 生成两站 favicon.ico（32x32，零依赖，手写 ICO 字节）。
// 品牌色取自 packages/ui/src/styles/colors-and-type.css 的 --emerald-600: oklch(0.5 0.14 158)，
// 在此换算为 sRGB（favicon 是独立静态资源，无法引用 CSS 变量）。
// 用法：node scripts/generate-favicon.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- OKLCH → sRGB（标准转换：OKLab → linear sRGB → gamma） ---
function oklchToSrgb(l: number, c: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return lin.map((v) => {
    const clamped = Math.min(1, Math.max(0, v));
    const srgb = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
    return Math.round(srgb * 255);
  }) as [number, number, number];
}

const [BR, BG, BB] = oklchToSrgb(0.5, 0.14, 158); // --emerald-600
console.log(
  `emerald-600 sRGB: #${[BR, BG, BB].map((v) => v.toString(16).padStart(2, "0")).join("")}`,
);

// --- 32x32 像素图：圆角矩形 emerald 底 + 白色粗体 "E" ---
const SIZE = 32;
type Rgba = [number, number, number, number];
const BRAND: Rgba = [BR, BG, BB, 255];
const WHITE: Rgba = [255, 255, 255, 255];
const CLEAR: Rgba = [0, 0, 0, 0];

function insideRoundedRect(x: number, y: number): boolean {
  const r = 6;
  const cx = x < r ? r - 0.5 : x >= SIZE - r ? SIZE - r - 0.5 : null;
  const cy = y < r ? r - 0.5 : y >= SIZE - r ? SIZE - r - 0.5 : null;
  if (cx === null || cy === null) return true;
  return (x - cx) ** 2 + (y - cy) ** 2 <= (r - 0.5) ** 2;
}

// "E"：竖笔 + 三条横笔，几何上居中（x 8-24，y 7-25，笔画粗 4）
function insideLetterE(x: number, y: number): boolean {
  if (x < 8 || x >= 24 || y < 7 || y >= 25) return false;
  if (x < 12) return true; // 竖笔
  if (y < 11 || y >= 21) return true; // 上下横笔
  return y >= 13 && y < 17 && x < 22; // 中横笔（略短）
}

const pixels: Rgba[][] = [];
for (let y = 0; y < SIZE; y++) {
  const row: Rgba[] = [];
  for (let x = 0; x < SIZE; x++) {
    if (!insideRoundedRect(x, y)) row.push(CLEAR);
    else row.push(insideLetterE(x, y) ? WHITE : BRAND);
  }
  pixels.push(row);
}

// --- 拼 ICO：ICONDIR + ICONDIRENTRY + BITMAPINFOHEADER + BGRA（自底向上）+ AND mask ---
const andMaskRowBytes = Math.ceil(SIZE / 32) * 4; // 每行按 32bit 对齐
const xorSize = SIZE * SIZE * 4;
const andSize = andMaskRowBytes * SIZE;
const bmpHeaderSize = 40;
const imageDataSize = bmpHeaderSize + xorSize + andSize;

const ico = Buffer.alloc(6 + 16 + imageDataSize);
// ICONDIR
ico.writeUInt16LE(0, 0); // reserved
ico.writeUInt16LE(1, 2); // type: icon
ico.writeUInt16LE(1, 4); // count
// ICONDIRENTRY
ico.writeUInt8(SIZE, 6); // width
ico.writeUInt8(SIZE, 7); // height
ico.writeUInt8(0, 8); // palette
ico.writeUInt8(0, 9); // reserved
ico.writeUInt16LE(1, 10); // planes
ico.writeUInt16LE(32, 12); // bpp
ico.writeUInt32LE(imageDataSize, 14); // data size
ico.writeUInt32LE(22, 18); // data offset
// BITMAPINFOHEADER
let off = 22;
ico.writeUInt32LE(bmpHeaderSize, off);
ico.writeInt32LE(SIZE, off + 4);
ico.writeInt32LE(SIZE * 2, off + 8); // height = XOR + AND
ico.writeUInt16LE(1, off + 12);
ico.writeUInt16LE(32, off + 14);
// 其余字段（压缩、分辨率等）保持 0
off += bmpHeaderSize;
// XOR：BGRA，自底向上
for (let y = SIZE - 1; y >= 0; y--) {
  for (let x = 0; x < SIZE; x++) {
    const [r, g, b, a] = pixels[y][x];
    ico.writeUInt8(b, off);
    ico.writeUInt8(g, off + 1);
    ico.writeUInt8(r, off + 2);
    ico.writeUInt8(a, off + 3);
    off += 4;
  }
}
// AND mask：alpha=0 的像素置 1（透明），自底向上
for (let y = SIZE - 1; y >= 0; y--) {
  const rowStart = off;
  for (let x = 0; x < SIZE; x++) {
    if (pixels[y][x][3] === 0) {
      ico[rowStart + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  off += andMaskRowBytes;
}

for (const target of ["apps/app/public", "apps/landing/public"]) {
  const dir = join(ROOT, target);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "favicon.ico"), ico);
  console.log(`written: ${target}/favicon.ico (${ico.length} bytes)`);
}
