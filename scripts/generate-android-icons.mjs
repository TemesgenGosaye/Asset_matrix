/**
 * Generates the Android launcher icon + splash screen from the desktop app's
 * logo (public/images/house_exe-admin_icon_house.png), so the APK matches the
 * Msf HomeDesk desktop client.
 *
 * Usage: node scripts/generate-android-icons.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const SRC = join(root, "public", "images", "house_exe-admin_icon_house.png");
const RES = join(root, "android", "app", "src", "main", "res");
const BG = "#FFFFFF";

const written = [];
async function emit(file, buf) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, buf);
  written.push(`${file.replace(root + "\\", "")} (${buf.length} bytes)`);
}

function containLayer(size, ratio) {
  const inner = Math.round(size * ratio);
  return sharp(SRC)
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: "lanczos3",
    })
    .png()
    .toBuffer();
}

async function iconOn(size, ratio = 0.72) {
  const layer = await containLayer(size, ratio);
  const inner = Math.round(size * ratio);
  const offset = Math.round((size - inner) / 2);
  return sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: layer, top: offset, left: offset }])
    .png()
    .toBuffer();
}

async function roundIcon(size, ratio = 0.72) {
  const base = await iconOn(size, ratio);
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  );
  return sharp(base)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function foreground(size, ratio = 0.6) {
  const layer = await containLayer(size, ratio);
  const inner = Math.round(size * ratio);
  const offset = Math.round((size - inner) / 2);
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: layer, top: offset, left: offset }])
    .png()
    .toBuffer();
}

async function splash(w, h) {
  const min = Math.min(w, h);
  const ratio = 0.36;
  const layer = await containLayer(min, ratio);
  const inner = Math.round(min * ratio);
  const top = Math.round((h - inner) / 2);
  const left = Math.round((w - inner) / 2);
  return sharp({
    create: { width: w, height: h, channels: 4, background: BG },
  })
    .composite([{ input: layer, top, left }])
    .png()
    .toBuffer();
}

async function main() {
  const meta = await sharp(SRC).metadata();
  if (!meta.width || !meta.height) {
    throw new Error(`Cannot read source icon: ${SRC}`);
  }

  const densities = {
    mdpi: 48,
    hdpi: 72,
    xhdpi: 96,
    xxhdpi: 144,
    xxxhdpi: 192,
  };

  for (const [density, size] of Object.entries(densities)) {
    const dir = join(RES, `mipmap-${density}`);
    await emit(join(dir, "ic_launcher.png"), await iconOn(size));
    await emit(join(dir, "ic_launcher_round.png"), await roundIcon(size));
    await emit(join(dir, "ic_launcher_foreground.png"), await foreground(size * 2));
  }

  await emit(join(RES, "drawable", "splash.png"), await splash(480, 480));

  const splashTargets = [
    ["drawable-port-mdpi", 320, 480],
    ["drawable-port-hdpi", 480, 800],
    ["drawable-port-xhdpi", 720, 1280],
    ["drawable-port-xxhdpi", 960, 1600],
    ["drawable-port-xxxhdpi", 1280, 1920],
    ["drawable-land-mdpi", 480, 320],
    ["drawable-land-hdpi", 800, 480],
    ["drawable-land-xhdpi", 1280, 720],
    ["drawable-land-xxhdpi", 1600, 960],
    ["drawable-land-xxxhdpi", 1920, 1280],
  ];
  for (const [dir, w, h] of splashTargets) {
    await emit(join(RES, dir, "splash.png"), await splash(w, h));
  }

  await emit(
    join(RES, "values", "ic_launcher_background.xml"),
    Buffer.from(
      `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`,
    ),
  );

  console.log(
    `Source: ${SRC.replace(root + "\\", "")} (${meta.width}x${meta.height})`,
  );
  console.log("Generated Android icons:\n  " + written.join("\n  "));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
