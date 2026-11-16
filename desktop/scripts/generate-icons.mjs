import { copyFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, "..");
const projectDir = path.resolve(desktopDir, "..");
const sourceIcon = path.join(
  projectDir,
  "public",
  "images",
  "house_exe-admin_icon_house.png",
);

const buildDir = path.join(desktopDir, "build");
const uiDir = path.join(desktopDir, "ui");
const icoPath = path.join(buildDir, "icon.ico");
const pngPath = path.join(buildDir, "icon.png");
const uiIconPath = path.join(uiDir, "icon.png");

const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256];
const require = createRequire(import.meta.url);

function loadSharp() {
  try {
    return require("sharp");
  } catch {
    try {
      return require(path.join(projectDir, "node_modules", "sharp"));
    } catch {
      throw new Error(
        "sharp is required to generate icons. Run `npm install` in desktop/ or at the project root.",
      );
    }
  }
}

function buildIcoBuffer(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let imageOffset = 6 + images.length * 16;
  const entries = [];

  for (const image of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(image.size >= 256 ? 0 : image.size, 0);
    entry.writeUInt8(image.size >= 256 ? 0 : image.size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(image.data.length, 8);
    entry.writeUInt32LE(imageOffset, 12);
    entries.push(entry);
    imageOffset += image.data.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

async function main() {
  const sharp = loadSharp();

  mkdirSync(buildDir, { recursive: true });
  mkdirSync(uiDir, { recursive: true });

  const sourceMetadata = await sharp(sourceIcon).metadata();
  if (!sourceMetadata.width || !sourceMetadata.height) {
    throw new Error(`Could not read icon source: ${sourceIcon}`);
  }

  const images = [];
  for (const size of ICON_SIZES) {
    const data = await sharp(sourceIcon)
      .resize(size, size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        kernel: "lanczos3",
      })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    images.push({ size, data });
  }

  writeFileSync(icoPath, buildIcoBuffer(images));

  const png256 = images.find((image) => image.size === 256).data;
  writeFileSync(pngPath, png256);
  copyFileSync(pngPath, uiIconPath);

  console.log(`Source: ${path.relative(projectDir, sourceIcon)} (${sourceMetadata.width}x${sourceMetadata.height})`);
  console.log(`ICO:    ${path.relative(projectDir, icoPath)} (${statSync(icoPath).size} bytes)`);
  console.log(`Sizes:  ${ICON_SIZES.join(", ")} px`);
  console.log(`PNG:    ${path.relative(projectDir, pngPath)}`);
  console.log(`UI:     ${path.relative(projectDir, uiIconPath)}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
