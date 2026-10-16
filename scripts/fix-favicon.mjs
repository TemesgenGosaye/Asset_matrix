/**
 * Fix favicon.ico: extract the PNG blob inside the ICO, convert to RGBA,
 * then repack a valid ICO with 32×32 and 16×16 RGBA PNGs.
 */
import sharp from "sharp";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const faviconPath = resolve(__dirname, "../src/app/favicon.ico");
const icoBuffer = readFileSync(faviconPath);

// --- Parse ICO to find the first image blob ---
// ICO header: 6 bytes (reserved=0, type=1, count=N)
const count = icoBuffer.readUInt16LE(4);
let sourceImage = null;

for (let i = 0; i < count; i++) {
  const entry = 6 + i * 16;
  const dataSize   = icoBuffer.readUInt32LE(entry + 8);
  const dataOffset = icoBuffer.readUInt32LE(entry + 12);
  const blob = icoBuffer.subarray(dataOffset, dataOffset + dataSize);
  // PNG magic: 89 50 4E 47
  if (blob[0] === 0x89 && blob[1] === 0x50) {
    console.log(`Found PNG blob at entry ${i} (${blob.length} bytes)`);
    sourceImage = blob;
    break;
  }
  // BMP: use blob directly via sharp BMP support
  if (!sourceImage) sourceImage = blob;
}

if (!sourceImage) {
  // Fallback: treat the whole ICO as a BMP/raw and let sharp try
  sourceImage = icoBuffer;
}

// --- Re-encode to RGBA PNG at 32×32 and 16×16 ---
async function toRgbaPng(buffer, size) {
  return sharp(buffer)
    .resize(size, size)
    .ensureAlpha()
    .png()
    .toBuffer();
}

const png32 = await toRgbaPng(sourceImage, 32);
const png16 = await toRgbaPng(sourceImage, 16);

// --- Build ICO ---
function buildIco(pngs) {
  const n = pngs.length;
  const headerSize = 6 + n * 16;
  const sizes = pngs.map((p) => {
    const w = p.readUInt32BE(16);
    const h = p.readUInt32BE(20);
    return { w, h };
  });

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(n, 4);

  const dirs = [];
  let offset = headerSize;
  for (let i = 0; i < n; i++) {
    const { w, h } = sizes[i];
    const d = Buffer.alloc(16);
    d.writeUInt8(w >= 256 ? 0 : w, 0);
    d.writeUInt8(h >= 256 ? 0 : h, 1);
    d.writeUInt8(0, 2);
    d.writeUInt8(0, 3);
    d.writeUInt16LE(1, 4);
    d.writeUInt16LE(32, 6);
    d.writeUInt32LE(pngs[i].length, 8);
    d.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    dirs.push(d);
  }

  return Buffer.concat([header, ...dirs, ...pngs]);
}

const ico = buildIco([png32, png16]);
writeFileSync(faviconPath, ico);
console.log(`favicon.ico regenerated — ${ico.length} bytes, RGBA PNG × 2 (32×32, 16×16).`);
