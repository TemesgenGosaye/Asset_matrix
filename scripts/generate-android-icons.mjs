import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const markSource = join(root, "android-shell", "app-icon.png");
const res = join(root, "android", "app", "src", "main", "res");

const written = [];

async function emit(file, buffer) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, buffer);
  written.push(`${file.replace(root + "\\", "")} (${buffer.length} bytes)`);
}

const trimmedMark = sharp(markSource).trim({ threshold: 1 }).png().toBuffer();

function canvasSvg(width, height) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<rect width="100%" height="100%" fill="#FFFFFF"/>` +
      `</svg>`,
  );
}

async function mark(size) {
  return sharp(await trimmedMark)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: "lanczos3",
    })
    .png()
    .toBuffer();
}

async function launcher(size) {
  const artSize = Math.round(size * 0.7);
  const art = await mark(artSize);
  const offset = Math.round((size - artSize) / 2);
  return sharp(canvasSvg(size, size))
    .composite([{ input: art, top: offset, left: offset }])
    .png()
    .toBuffer();
}

async function roundLauncher(size) {
  const base = await launcher(size);
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  );
  return sharp(base)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function foreground(size) {
  const artSize = Math.round(size * 0.66);
  const art = await mark(artSize);
  const offset = Math.round((size - artSize) / 2);
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: art, top: offset, left: offset }])
    .png()
    .toBuffer();
}

async function splash(width, height) {
  return sharp(canvasSvg(width, height)).png().toBuffer();
}

async function main() {
  const densities = {
    mdpi: 48,
    hdpi: 72,
    xhdpi: 96,
    xxhdpi: 144,
    xxxhdpi: 192,
  };

  for (const [density, size] of Object.entries(densities)) {
    await emit(
      join(res, `mipmap-${density}`, "ic_launcher.png"),
      await launcher(size),
    );
    await emit(
      join(res, `mipmap-${density}`, "ic_launcher_round.png"),
      await roundLauncher(size),
    );
    await emit(
      join(res, `mipmap-${density}`, "ic_launcher_foreground.png"),
      await foreground(size * 2),
    );
  }

  await emit(join(res, "drawable", "splash.png"), await splash(480, 480));
  await emit(join(res, "drawable", "splash_logo.png"), await mark(320));

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

  for (const [directory, width, height] of splashTargets) {
    await emit(join(res, directory, "splash.png"), await splash(width, height));
  }

  await emit(
    join(res, "values", "ic_launcher_background.xml"),
    Buffer.from(
      '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#FFFFFF</color>\n</resources>\n',
    ),
  );

  const adaptive = (round) =>
    `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/ic_launcher_background"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n${round ? '    <monochrome android:drawable="@mipmap/ic_launcher_foreground"/>\n' : ""}</adaptive-icon>\n`;

  await emit(
    join(res, "mipmap-anydpi-v26", "ic_launcher.xml"),
    Buffer.from(adaptive(false)),
  );
  await emit(
    join(res, "mipmap-anydpi-v26", "ic_launcher_round.xml"),
    Buffer.from(adaptive(true)),
  );

  console.log(`Generated ${written.length} Android image resources.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
