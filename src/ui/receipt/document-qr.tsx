/**
 * QR codes on printed documents.
 *
 * Same constraint as the rubber stamp and the name seal in `./house-style`: the
 * document is rasterised with html2canvas before it becomes a PDF, and html2canvas
 * is only guaranteed to reproduce `background-image` data URIs faithfully. An
 * inline `<svg>` element gets serialised by the browser's own SVG-to-image path,
 * which a rasteriser cannot reproduce at a predictable scale. So the QR is built
 * as an SVG string, URI-encoded into a data URI, and applied as a background -
 * the same technique already proven on `STAMP_SVG` and `NAME_STAMP_SVG`.
 *
 * The module matrix comes from `qrcode`'s `create()`, which is synchronous. The
 * async `toDataURL` / `toString` entry points would leave a hole in the page
 * until they resolved, and the preview dialog would visibly reflow.
 */

import type { CSSProperties } from "react";
import QRCode from "qrcode";
import { NAVY } from "./house-style";

/**
 * Error correction level.
 *
 * `M` rather than the default `L`: the code is rasterised at scale 2 and then
 * JPEG-compressed into the PDF, which introduces exactly the speckle that low
 * correction cannot absorb. `M` also still fits a receipt number comfortably -
 * a 16-character `RENT-2026-000123` encodes at version 2, 25 modules.
 */
const ERROR_CORRECTION = "M" as const;

/** Quiet zone, in modules. The spec requires four on every side. */
const QUIET_ZONE = 4;

/** The full SVG source for one QR, or null when the value cannot be encoded. */
function qrSvg(value: string): string | null {
  let size: number;
  let data: Uint8Array;
  try {
    ({ size, data } = QRCode.create(value, {
      errorCorrectionLevel: ERROR_CORRECTION,
    }).modules);
  } catch {
    // An empty or over-long value throws. A receipt must still print without
    // its QR rather than fail to render, so the caller drops the block.
    return null;
  }
  if (!size || data.length < size * size) return null;

  // Horizontal runs of dark modules become one `M x y h len v 1 h -len z` subpath
  // rather than a rect per module: a version-2 code is 625 modules and a
  // version-6 one over 2,000, so per-module rects would triple the data URI
  // length for no gain.
  let path = "";
  for (let row = 0; row < size; row += 1) {
    let run = 0;
    for (let col = 0; col <= size; col += 1) {
      // The sentinel column closes a run that reaches the right edge.
      const dark = col < size && data[row * size + col] === 1;
      if (dark) {
        run += 1;
        continue;
      }
      if (run > 0) {
        path += `M${col - run} ${row}h${run}v1h-${run}z`;
        run = 0;
      }
    }
  }

  // The viewBox is padded by the quiet zone on every side so the code keeps the
  // four-module margin the spec requires. The path is drawn in matrix
  // coordinates (y down), so it is flipped and offset into that padded box.
  const span = size + QUIET_ZONE * 2;
  const transform = `translate(${QUIET_ZONE} ${QUIET_ZONE}) scale(1 -1) translate(0 -${size})`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}" shape-rendering="crispEdges"><rect width="${span}" height="${span}" fill="#ffffff"/><g transform="${transform}"><path d="${path}" fill="${NAVY}"/></g></svg>`;
}

/**
 * A QR code printed on a form.
 *
 * `caption` sits under the code in print-size type. It is not decoration: a QR
 * that is scanned constantly needs to say what it is for at the moment it is
 * handed over, not only to whoever already knows.
 *
 * Renders nothing when there is no value, so a receipt whose month is unsettled
 * does not print an empty square that a reader would try to scan.
 */
export function DocumentQrCode({
  value,
  size = 74,
  caption,
  style,
}: {
  /** Encoded content. Empty or unencodable values render nothing. */
  value: string | null | undefined;
  /** Print size in pixels. */
  size?: number;
  caption?: string;
  style?: CSSProperties;
}) {
  const encoded = value?.trim();
  if (!encoded) return null;

  const svg = qrSvg(encoded);
  if (!svg) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "2px",
        ...style,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          backgroundImage: `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`,
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
        }}
      />
      {caption ? (
        <span
          style={{
            fontSize: "6.6pt",
            letterSpacing: "0.3px",
            color: "#454d56",
            textAlign: "center",
            lineHeight: "1.2",
            maxWidth: `${size}px`,
          }}
        >
          {caption}
        </span>
      ) : null}
    </div>
  );
}
