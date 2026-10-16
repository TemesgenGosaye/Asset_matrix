/**
 * Organisation identity for the application chrome.
 *
 * One source of truth for the factory name and the portal name, because they are
 * rendered in three separate shells — the desktop sidebar, the top bar, and the
 * mobile sheet. They previously each carried their own copy of the English
 * string, which is exactly the arrangement where a rename silently misses one.
 *
 * The Amharic is the primary form, not a translation of the English: this is an
 * Ethiopian state sugar factory, and the printed forms already lead with
 * "መተሐራ ስኳር ፋብሪካ". The English line is kept beneath it as the register for
 * staff and for anyone outside the organisation who has to read the screen.
 *
 * The Ethiopic faces these need are declared in `globals.css`
 * (`--font-family-sans`); Geist has no Ethiopic coverage of its own.
 */

/** የመተሐራ ስኳር ፋብሪካ — Metahara Sugar Factory. */
export const FACTORY_NAME_AM = "የመተሐራ ስኳር ፋብሪካ";

export const FACTORY_NAME_EN = "Metahara Sugar Factory";

/** The portal this software is: asset and house administration. */
export const PORTAL_NAME_AM = "የንብረትና የቤት አስተዳደር ፖርታል";

export const PORTAL_NAME_EN = "Asset and House Portal";

/** The full lockup as it appears on screen: factory over portal. */
export const BRAND = {
  factoryAm: FACTORY_NAME_AM,
  factoryEn: FACTORY_NAME_EN,
  portalAm: PORTAL_NAME_AM,
  portalEn: PORTAL_NAME_EN,
} as const;

/** One-line Amharic form, for contexts that cannot stack two lines. */
export const BRAND_AM_ONE_LINE = `${FACTORY_NAME_AM} ${PORTAL_NAME_AM}`;

/** One-line English form. */
export const BRAND_EN_ONE_LINE = `MSF ${PORTAL_NAME_EN}`;
