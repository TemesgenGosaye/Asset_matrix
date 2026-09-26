/**
 * Generates the raster app icons required for:
 *   - the PWA manifest (public/manifest.json) — Android/Chrome need PNG, not SVG
 *   - the Capacitor Android launcher icon + splash screen
 *
 * Source of truth is public/icons/icon.svg. Maskable variants scale the artwork
 * into the inner 80% safe zone so Android's circular mask never clips it.
 *
 * Usage: node scripts/generate-icons.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicIcons = join(root, "public", "icons");
const androidRes = join(root, "android", "app", "src", "main", "res");
const BRAND = "#0f172a";

/** Artwork without the <text> node, which rasterizers render inconsistently. */
const MARK = `
  <rect width="512" height="512" rx="64" fill="${BRAND}"/>
  <g transform="translate(0,-30)">
    <path d="M256 100L380 180V340L256 420L132 340V180L256 100Z" stroke="#3b82f6" stroke-width="16" fill="none"/>
    <path d="M256 140L350 200V320L256 380L162 320V200L256 140Z" fill="#3b82f6" opacity="0.2"/>
    <circle cx="256" cy="240" r="40" fill="#3b82f6"/>
    <rect x="236" y="280" width="40" height="60" rx="4" fill="#3b82f6"/>
  </g>`;

const svg = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${inner}</svg>`;

/** Full-bleed icon: artwork fills the canvas (use with purpose "any"). */
const anyIcon = (size) =>
  sharp(Buffer.from(svg(MARK))).resize(size, size).png().toBuffer();

/**
 * Maskable icon: full-bleed background with the artwork scaled to 66% and
 * centred, keeping every meaningful pixel inside the 80% safe circle.
 */
async function maskableIcon(size) {
  const art = Math.round(size * 0.66);
  const inset = Math.round((size - art) / 2);
  const layer = await sharp(Buffer.from(svg(MARK)))
    .resize(art, art)
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BRAND,
    },
  })
    .composite([{ input: layer, top: inset, left: inset }])
    .png()
    .toBuffer();
}

/**
 * Android adaptive-icon foreground layer: fully transparent, with the
 * artwork scaled to 60% so it survives the 66% circular mask.
 */
async function adaptiveForeground(size) {
  const art = Math.round(size * 0.6);
  const inset = Math.round((size - art) / 2);
  const layer = await sharp(Buffer.from(svg(MARK)))
    .resize(art, art)
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: layer, top: inset, left: inset }])
    .png()
    .toBuffer();
}

const written = [];

async function emit(file, buffer) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, buffer);
  written.push(`${file.replace(root + "\\", "")} (${buffer.length} bytes)`);
}

async function main() {
  // PWA / web
  await emit(join(publicIcons, "icon-192.png"), await anyIcon(192));
  await emit(join(publicIcons, "icon-512.png"), await anyIcon(512));
  await emit(join(publicIcons, "icon-maskable-192.png"), await maskableIcon(192));
  await emit(join(publicIcons, "icon-maskable-512.png"), await maskableIcon(512));

  // Apple touch icon (also used by the iOS Capacitor target)
  await emit(join(publicIcons, "apple-touch-icon.png"), await anyIcon(180));

  // Android launcher (legacy square/round raster) + adaptive layers
  for (const dir of ["mipmap-mdpi", "mipmap-hdpi", "mipmap-xhdpi", "mipmap-xxhdpi", "mipmap-xxxhdpi"]) {
    const density = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }[
      dir.replace("mipmap-", "")
    ];
    await emit(join(androidRes, dir, "ic_launcher.png"), await anyIcon(density));
    await emit(join(androidRes, dir, "ic_launcher_round.png"), await anyIcon(density));
    await emit(
      join(androidRes, dir, "ic_launcher_foreground.png"),
      await adaptiveForeground(density * 2),
    );
  }

  // Splash / launch screens
  await emit(join(androidRes, "drawable", "splash.png"), await maskableIcon(480));
  await emit(join(publicIcons, "splash-icon.png"), await anyIcon(512));

  console.log("Generated icons:\n  " + written.join("\n  "));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
