import type { ReturnType } from "./treemap-palette";

/** Caption row above a sector on the phone heatmap. Small sectors stay all tiles. */
export function mobileSectorChrome(width: number, height: number) {
  const labeled = width >= 36 && height >= 28;
  return {
    labeled,
    header: labeled ? 14 : 0,
    gutter: Math.min(2, width / 16, height / 16),
  };
}

/**
 * What a phone tile can show without clipping. Large tiles stack a logo, ticker,
 * and return. Medium tiles keep the ticker and return. Tiny tiles stay a swatch,
 * or a logo when that still fits.
 */
export function mobileTileLayout(width: number, height: number, hasAvatar: boolean) {
  const minSide = Math.min(width, height);
  const showSymbol = width >= 36 && height >= 28;
  const showPercent = width >= 44 && height >= 40;
  const showLogo = hasAvatar && minSide >= 20 && (height >= 48 || !showSymbol);
  return {
    showSymbol,
    showPercent,
    showLogo,
    symbolSize: Math.max(10, Math.min(20, minSide * 0.18)),
    percentSize: Math.max(9, Math.min(15, minSide * 0.14)),
    logoSize: Math.max(14, Math.min(64, minSide * (showSymbol && showPercent ? 0.34 : 0.62))),
  };
}

/** Legend stops for the phone color scale. Daily moves use a tighter range. */
export function heatmapScaleStops(returnType: ReturnType): number[] {
  return returnType === "daily"
    ? [-0.08, -0.05, -0.02, 0, 0.02, 0.05, 0.08]
    : [-0.5, -0.25, -0.1, 0, 0.1, 0.25, 0.5];
}
