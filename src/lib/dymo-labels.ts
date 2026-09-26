/**
 * DYMO label XML builders.
 * Generates complete DYMO DLS-format XML with asset data already embedded.
 * Units are twips (1 inch = 1440 twips).
 */

export type DymoLabelSize =
  | { preset: "30334" | "30252" | "30336" | "30321" }
  | { custom: { widthIn: number; heightIn: number } };

export interface DymoLabelSizeOption {
  id: string;
  label: string;
  widthIn: number;
  heightIn: number;
  paperName: string;
}

export const DYMO_LABEL_SIZES: DymoLabelSizeOption[] = [
  {
    id: "30334",
    label: '30334 · 2.25" × 1.25"',
    widthIn: 2.25,
    heightIn: 1.25,
    paperName: "30334 2-1/4 in x 1-1/4 in",
  },
  {
    id: "30252",
    label: '30252 · 3.5" × 1.125"',
    widthIn: 3.5,
    heightIn: 1.125,
    paperName: "30252 Address",
  },
  {
    id: "30336",
    label: '30336 · 2.125" × 1"',
    widthIn: 2.125,
    heightIn: 1.0,
    paperName: "30336 1 in x 2-1/8 in",
  },
  {
    id: "30321",
    label: '30321 · 2.31" × 1.5"',
    widthIn: 2.31,
    heightIn: 1.5,
    paperName: "30321 Name Badge",
  },
];

export interface DymoAssetData {
  assetId: string;
  assetName: string;
  assetTag: string;
  serialNumber: string;
  manufacturer: string;
  model: string;
  location: string;
  category: string;
  qrUrl: string;
}

/** Escape a string for safe embedding in XML text/attribute content. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toTwips(inches: number): number {
  return Math.round(inches * 1440);
}

/**
 * Build a DYMO label XML object definition for a text field.
 * x, y, w, h are in twips.
 */
function textObject(
  name: string,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  bold = false,
  size = 8,
): string {
  if (!text) return "";
  return `
  <ObjectInfo>
    <TextObject>
      <Name>${name}</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName />
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <GroupID>-1</GroupID>
      <IsOutlined>False</IsOutlined>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <Attributes>
            <Font Family="Arial" Size="${size}" Bold="${bold ? "True" : "False"}" Italic="False" Underline="False" StrikeOut="False" />
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
          </Attributes>
          <String>${escapeXml(text)}</String>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="${x}" Y="${y}" Width="${w}" Height="${h}" />
  </ObjectInfo>`;
}

/** Build a DYMO QR code barcode object. x, y, w, h are in twips. */
function qrObject(
  name: string,
  value: string,
  x: number,
  y: number,
  size: number,
): string {
  return `
  <ObjectInfo>
    <BarcodeObject>
      <Name>${name}</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName />
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <GroupID>-1</GroupID>
      <IsOutlined>False</IsOutlined>
      <Text>${escapeXml(value)}</Text>
      <Type>QRCode</Type>
      <Size>Small</Size>
      <TextPosition>None</TextPosition>
      <TextFont />
      <ECLevel>0</ECLevel>
      <HorizontalAlignment>Center</HorizontalAlignment>
      <QuietZonesPadding Left="0" Top="0" Right="0" Bottom="0" />
    </BarcodeObject>
    <Bounds X="${x}" Y="${y}" Width="${size}" Height="${size}" />
  </ObjectInfo>`;
}

function wrapLabel(
  paperName: string,
  widthTwips: number,
  heightTwips: number,
  objects: string,
): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips" MediaType="Default">
  <PaperOrientation>Landscape</PaperOrientation>
  <Id>Small</Id>
  <IsOutlined>False</IsOutlined>
  <PaperName>${escapeXml(paperName)}</PaperName>
  <DrawCommands>
    <RoundRectangle X="0" Y="0" Width="${widthTwips}" Height="${heightTwips}" Rx="270" Ry="270" />
  </DrawCommands>${objects}
</DieCutLabel>`;
}

/** 30334 – 2.25" × 1.25" (3240 × 1800 twips): name + tag + serial + location / QR right */
function build30334(data: DymoAssetData): string {
  const W = 3240;
  const H = 1800;
  const pad = 60;
  const textW = 2300;
  const qrSize = 1560;
  const qrX = W - qrSize - pad;

  const lines = [
    textObject("AssetName", data.assetName, pad, pad, textW, 420, true, 10),
    textObject(
      "AssetTag",
      data.assetTag ? `Tag: ${data.assetTag}` : "",
      pad,
      530,
      textW,
      300,
      false,
      8,
    ),
    textObject(
      "Serial",
      data.serialNumber ? `S/N: ${data.serialNumber}` : "",
      pad,
      870,
      textW,
      300,
      false,
      8,
    ),
    textObject("Location", data.location, pad, 1210, textW, 300, false, 8),
    qrObject("QRCode", data.qrUrl, qrX, pad, qrSize),
  ].join("");

  return wrapLabel("30334 2-1/4 in x 1-1/4 in", W, H, lines);
}

/** 30252 – 3.5" × 1.125" (5040 × 1620 twips): name + tag + serial + mfr+model / QR right */
function build30252(data: DymoAssetData): string {
  const W = 5040;
  const H = 1620;
  const pad = 60;
  const textW = 3700;
  const qrSize = 1440;
  const qrX = W - qrSize - pad;

  const mfrModel = [data.manufacturer, data.model].filter(Boolean).join(" · ");
  const lines = [
    textObject("AssetName", data.assetName, pad, pad, textW, 400, true, 10),
    textObject(
      "AssetTag",
      data.assetTag ? `Tag: ${data.assetTag}` : "",
      pad,
      500,
      textW,
      300,
      false,
      8,
    ),
    textObject(
      "Serial",
      data.serialNumber ? `S/N: ${data.serialNumber}` : "",
      pad,
      840,
      textW,
      300,
      false,
      8,
    ),
    textObject("MfrModel", mfrModel, pad, 1180, textW, 300, false, 8),
    qrObject("QRCode", data.qrUrl, qrX, pad, qrSize),
  ].join("");

  return wrapLabel("30252 Address", W, H, lines);
}

/** 30336 – 2.125" × 1" (3060 × 1440 twips): compact — name + tag + serial / QR right */
function build30336(data: DymoAssetData): string {
  const W = 3060;
  const H = 1440;
  const pad = 55;
  const textW = 1980;
  const qrSize = 1260;
  const qrX = W - qrSize - pad;

  const lines = [
    textObject("AssetName", data.assetName, pad, pad, textW, 380, true, 9),
    textObject(
      "AssetTag",
      data.assetTag ? `Tag: ${data.assetTag}` : "",
      pad,
      500,
      textW,
      280,
      false,
      8,
    ),
    textObject(
      "Serial",
      data.serialNumber ? `S/N: ${data.serialNumber}` : "",
      pad,
      820,
      textW,
      280,
      false,
      8,
    ),
    qrObject("QRCode", data.qrUrl, qrX, pad, qrSize),
  ].join("");

  return wrapLabel("30336 1 in x 2-1/8 in", W, H, lines);
}

/** 30321 – 2.31" × 1.5" (3326 × 2160 twips): name + tag + serial + location + category / QR right */
function build30321(data: DymoAssetData): string {
  const W = 3326;
  const H = 2160;
  const pad = 65;
  const textW = 2200;
  const qrSize = 1800;
  const qrX = W - qrSize - pad;

  const lines = [
    textObject("AssetName", data.assetName, pad, pad, textW, 440, true, 11),
    textObject(
      "AssetTag",
      data.assetTag ? `Tag: ${data.assetTag}` : "",
      pad,
      560,
      textW,
      300,
      false,
      8,
    ),
    textObject(
      "Serial",
      data.serialNumber ? `S/N: ${data.serialNumber}` : "",
      pad,
      900,
      textW,
      300,
      false,
      8,
    ),
    textObject("Location", data.location, pad, 1240, textW, 300, false, 8),
    textObject("Category", data.category, pad, 1580, textW, 300, false, 8),
    qrObject("QRCode", data.qrUrl, qrX, pad, qrSize),
  ].join("");

  return wrapLabel("30321 Name Badge", W, H, lines);
}

/** Custom size: proportional layout based on user-entered inches. */
function buildCustom(
  data: DymoAssetData,
  widthIn: number,
  heightIn: number,
): string {
  const W = toTwips(widthIn);
  const H = toTwips(heightIn);
  const pad = Math.round(H * 0.04);
  const qrSize = Math.round(H * 0.88);
  const qrX = W - qrSize - pad;
  const textW = qrX - pad * 2;
  const lineH = Math.round((H - pad * 2) / 4);

  const lines = [
    textObject("AssetName", data.assetName, pad, pad, textW, lineH, true, 9),
    textObject(
      "AssetTag",
      data.assetTag ? `Tag: ${data.assetTag}` : "",
      pad,
      pad + lineH,
      textW,
      lineH,
      false,
      7,
    ),
    textObject(
      "Serial",
      data.serialNumber ? `S/N: ${data.serialNumber}` : "",
      pad,
      pad + lineH * 2,
      textW,
      lineH,
      false,
      7,
    ),
    textObject(
      "Location",
      data.location,
      pad,
      pad + lineH * 3,
      textW,
      lineH,
      false,
      7,
    ),
    qrObject("QRCode", data.qrUrl, qrX, pad, qrSize),
  ].join("");

  return wrapLabel("Custom", W, H, lines);
}

export function buildDymoLabelXml(
  data: DymoAssetData,
  size: DymoLabelSize,
): string {
  if ("preset" in size) {
    switch (size.preset) {
      case "30334":
        return build30334(data);
      case "30252":
        return build30252(data);
      case "30336":
        return build30336(data);
      case "30321":
        return build30321(data);
    }
  }
  return buildCustom(data, size.custom.widthIn, size.custom.heightIn);
}
