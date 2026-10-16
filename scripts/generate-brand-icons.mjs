/**
 * Derives every brand icon from the Metahara Sugar Factory logo
 * (public/images/msflogo.jpg) instead of the geometric placeholder mark.
 *
 * Emits:
 *   - src/app/icon.png + src/app/apple-icon.png + src/app/favicon.ico
 *     (Next.js App Router file conventions → <link rel="icon"> / browser tab)
 *   - public/icons/* so public/manifest.json keeps resolving (PWA + Android)
 *   - public/icons/msf-logo.png for the in-app navbars, where the artwork needs
 *     to survive at 32px next to text
 *
 * The source JPG is a wide, white-padded capture of a circular badge, so every
 * variant is trimmed and re-centred onto a square canvas first — otherwise the
 * badge renders tiny and off-centre once scaled to 32x32.
 *
 * Usage: node scripts/generate-brand-icons.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const logoPath = join(root, "public", "images", "msflogo.jpg");
const publicIcons = join(root, "public", "icons");
const appDir = join(root, "src", "app");

/** The badge is a yellow/green circle on white — trim against white. */
const TRIM = { threshold: 12 };

/**
 * Logo artwork is a handful of flat colours, so an indexed 256-colour PNG is
 * visually identical and roughly 8x smaller than the truecolour default. Every
 * emit goes through this so the icons stay cheap to fetch.
 */
const PNG = {
  compressionLevel: 9,
  palette: true,
  quality: 90,
  effort: 10,
};

/**
 * Trim the white padding off the source capture, then square it up.
 *
 * `trim` gives the badge's true bounds; the caller resizes from there, so the
 * result is the artwork alone with no white margin to shrink it.
 */
async function trimmedBadge() {
  return sharp(logoPath).trim(TRIM).toBuffer();
}

/**
 * Square artwork for a given size.
 *
 * `contain` keeps the whole badge visible; the white plate behind it is what
 * keeps the yellow ring legible in dark mode, where the navbar background is
 * near-black.
 */
function square(badge, size, { background = "#ffffff" } = {}) {
  return sharp(badge)
    .resize(size, size, { fit: "contain", background })
    .extend({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      background,
    })
    .png(PNG)
    .toBuffer();
}

/**
 * Maskable icon: artwork inside the 80% safe circle so Android's mask and
 * iOS's rounded mask never clip the ring or the factory name.
 */
async function maskable(badge, size) {
  const art = Math.round(size * 0.8);
  const inset = Math.round((size - art) / 2);
  const layer = await sharp(badge)
    .resize(art, art, { fit: "contain", background: "#ffffff" })
    .png(PNG)
    .toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 4, background: "#ffffff" },
  })
    .composite([{ input: layer, top: inset, left: inset }])
    .png(PNG)
    .toBuffer();
}

/**
 * Pack PNG buffers into a single .ico.
 *
 * ICO allows PNG-compressed entries since Vista, which is every browser that
 * still honours favicon.ico — so the PNGs are embedded verbatim rather than
 * re-encoded to BMP.
 */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(16 * entries.length);
  let offset = header.length + directory.length;

  entries.forEach(({ size, png }, index) => {
    const at = index * 16;
    directory.writeUInt8(size >= 256 ? 0 : size, at + 0); // width  (0 == 256)
    directory.writeUInt8(size >= 256 ? 0 : size, at + 1); // height
    directory.writeUInt8(0, at + 2); // palette size
    directory.writeUInt8(0, at + 3); // reserved
    directory.writeUInt16LE(1, at + 4); // colour planes
    directory.writeUInt16LE(32, at + 6); // bits per pixel
    directory.writeUInt32LE(png.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });

  return Buffer.concat([header, directory, ...entries.map((e) => e.png)]);
}

const written = [];

async function emit(file, buffer) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, buffer);
  written.push(`${file.replace(root + "\\", "")} (${buffer.length} bytes)`);
}

async function main() {
  const badge = await trimmedBadge();
  const { width, height } = await sharp(badge).metadata();
  console.log(
    `Trimmed badge: ${width}x${height} (was ${(
      await sharp(logoPath).metadata()
    ).width}x${(await sharp(logoPath).metadata()).height})`,
  );

  // Browser tab / bookmark — the App Router picks these up automatically, but
  // layout.tsx also declares them explicitly in metadata.icons.
  await emit(join(appDir, "icon.png"), await square(badge, 512));
  await emit(join(appDir, "apple-icon.png"), await square(badge, 180));
  await emit(
    join(appDir, "favicon.ico"),
    buildIco(
      await Promise.all(
        [16, 32, 48].map(async (size) => ({ size, png: await square(badge, size) })),
      ),
    ),
  );

  // In-app navbars. 256 keeps next/image's srcset useful without bloating it.
  await emit(join(publicIcons, "msf-logo.png"), await square(badge, 256));

  // public/manifest.json + Android launcher still point at these.
  await emit(join(publicIcons, "icon-192.png"), await square(badge, 192));
  await emit(join(publicIcons, "icon-512.png"), await square(badge, 512));
  await emit(
    join(publicIcons, "apple-touch-icon.png"),
    await square(badge, 180),
  );
  await emit(
    join(publicIcons, "icon-maskable-192.png"),
    await maskable(badge, 192),
  );
  await emit(
    join(publicIcons, "icon-maskable-512.png"),
    await maskable(badge, 512),
  );
  await emit(join(publicIcons, "splash-icon.png"), await square(badge, 512));

  // src/app/icon.png already covers the web build; android/ is a separate
  // Capacitor target refreshed by its own gradle task, so leave it alone.

  console.log("Generated brand icons:\n  " + written.join("\n  "));
}

// Fail loudly if the source asset was moved/renamed rather than silently
// emitting blank icons.
readFile(logoPath).catch(() => {
  console.error(`Source logo missing: ${logoPath}`);
  process.exit(1);
});

main().catch((err) => {
  console.error(err);
  process.exit(1);
});