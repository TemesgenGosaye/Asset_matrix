import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, "..");
const projectDir = path.resolve(desktopDir, "..");
const buildDir = path.join(desktopDir, "build");
const sourceIcon = path.join(
  projectDir,
  "public",
  "images",
  "house_exe-admin_icon_house.png",
);

const require = createRequire(import.meta.url);

function loadSharp() {
  try {
    return require("sharp");
  } catch {
    return require(path.join(projectDir, "node_modules", "sharp"));
  }
}

function bmpFromRgba(data, width, height) {
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelSize = rowSize * height;
  const fileSize = 54 + pixelSize;
  const buffer = Buffer.alloc(fileSize);

  buffer.write("BM", 0);
  buffer.writeUInt32LE(fileSize, 2);
  buffer.writeUInt32LE(0, 6);
  buffer.writeUInt32LE(54, 10);

  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(0, 30);
  buffer.writeUInt32LE(pixelSize, 34);
  buffer.writeInt32LE(2835, 38);
  buffer.writeInt32LE(2835, 42);
  buffer.writeUInt32LE(0, 46);
  buffer.writeUInt32LE(0, 50);

  for (let y = 0; y < height; y += 1) {
    const sourceRow = (height - 1 - y) * width * 4;
    const targetRow = 54 + y * rowSize;
    for (let x = 0; x < width; x += 1) {
      const source = sourceRow + x * 4;
      const target = targetRow + x * 3;
      buffer[target] = data[source + 2];
      buffer[target + 1] = data[source + 1];
      buffer[target + 2] = data[source];
    }
  }

  return buffer;
}

function headerSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="150" height="57" viewBox="0 0 150 57">
      <rect width="150" height="57" fill="#FFFFFF"/>
      <rect x="9.5" y="9.5" width="38" height="38" rx="11" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1"/>
      <text x="58" y="25" font-family="Segoe UI, Arial, sans-serif" font-size="11.5" font-weight="700" fill="#000000">Msf HomeDesk</text>
      <text x="58" y="37" font-family="Segoe UI, Arial, sans-serif" font-size="6.5" font-weight="600" letter-spacing="1.1" fill="#000000">HOUSE ADMINISTRATION</text>
      <text x="58" y="47" font-family="Segoe UI, Arial, sans-serif" font-size="6.5" fill="#000000">Metahara Sugar Factory</text>
      <rect x="0" y="55" width="150" height="2" fill="#38bdf8" fill-opacity="0.5"/>
    </svg>
  `;
}

function sidebarSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="164" height="314" viewBox="0 0 164 314">
      <rect width="164" height="314" fill="#FFFFFF"/>

      <rect x="45.5" y="30.5" width="73" height="73" rx="20" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1"/>
      <rect x="50.5" y="35.5" width="63" height="63" rx="15" fill="#FFFFFF" stroke="#F1F5F9" stroke-width="1"/>

      <text x="82" y="132" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="17" font-weight="800" fill="#000000">Msf HomeDesk</text>
      <text x="82" y="150" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="6.5" font-weight="600" letter-spacing="1.5" fill="#000000">HOUSE ADMINISTRATION PORTAL</text>

      <rect x="34" y="170" width="96" height="1" fill="#E2E8F0"/>

      <text x="82" y="195" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="7.5" font-weight="600" fill="#000000">Metahara Sugar Factory</text>
      <text x="82" y="207" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="7" fill="#000000">IT Department</text>

      <text x="82" y="292" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="6.5" fill="#000000">Powered by Temesgen G.</text>
    </svg>
  `;
}

async function renderAsset(sharp, { svg, icon, width, height, iconLeft, iconTop, iconSize, output }) {
  const background = await sharp(Buffer.from(svg)).png().toBuffer();
  const iconBuffer = await sharp(icon)
    .resize(iconSize, iconSize, { fit: "contain" })
    .png()
    .toBuffer();

  const { data, info } = await sharp(background)
    .composite([{ input: iconBuffer, left: iconLeft, top: iconTop }])
    .flatten({ background: "#FFFFFF" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width !== width || info.height !== height) {
    throw new Error(`Unexpected size for ${output}: ${info.width}x${info.height}`);
  }

  if (info.channels !== 4) {
    throw new Error(`Unexpected channel count for ${output}: ${info.channels}`);
  }

  const bmp = bmpFromRgba(data, width, height);
  writeFileSync(path.join(buildDir, output), bmp);
  console.log(`Wrote build/${output} (${width}x${height}, ${bmp.length} bytes)`);
}

async function main() {
  const sharp = loadSharp();
  mkdirSync(buildDir, { recursive: true });

  await renderAsset(sharp, {
    svg: headerSvg(),
    icon: sourceIcon,
    width: 150,
    height: 57,
    iconLeft: 13,
    iconTop: 13,
    iconSize: 30,
    output: "installerHeader.bmp",
  });

  await renderAsset(sharp, {
    svg: sidebarSvg(),
    icon: sourceIcon,
    width: 164,
    height: 314,
    iconLeft: 55,
    iconTop: 40,
    iconSize: 54,
    output: "installerSidebar.bmp",
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
