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
 * What a phone tile can show without clipping. The logo comes first, then the
 * return, then the ticker. A tight tile keeps the mark and drops the ticker.
 * Tiny tiles stay a swatch.
 */
function tileStackHeight(sizes: number[]): number {
  const rows = sizes.filter((size) => size > 0);
  return rows.reduce((sum, size) => sum + size, 0) + 2 * Math.max(0, rows.length - 1);
}

export function mobileTileLayout(width: number, height: number, hasAvatar: boolean) {
  const minSide = Math.min(width, height);
  const symbolSize = Math.max(10, Math.min(20, minSide * 0.18));
  const percentSize = Math.max(9, Math.min(15, minSide * 0.14));
  const fits = (...sizes: number[]) => tileStackHeight(sizes) <= height;

  if (!hasAvatar) {
    const showSymbol = width >= 36 && height >= 28 && fits(symbolSize);
    const showPercent = width >= 44 && fits(showSymbol ? symbolSize : 0, percentSize);
    return {
      showSymbol,
      showPercent,
      showLogo: false,
      symbolSize,
      percentSize,
      logoSize: Math.max(14, Math.min(64, minSide * 0.62)),
    };
  }

  const preferredLogo = Math.max(14, Math.min(64, minSide * 0.62));
  let logoSize = preferredLogo;
  let showLogo = minSide >= 20 && width >= 14 && fits(logoSize);
  if (!showLogo && minSide >= 20 && width >= 14 && fits(14)) {
    logoSize = 14;
    showLogo = true;
  }

  const showPercent = showLogo
    ? width >= 44 && fits(logoSize, percentSize)
    : width >= 44 && height >= 40 && fits(percentSize);
  const showSymbol =
    width >= 36 &&
    (showLogo || height >= 28) &&
    fits(showLogo ? logoSize : 0, showPercent ? percentSize : 0, symbolSize);

  return {
    showSymbol,
    showPercent,
    showLogo,
    symbolSize,
    percentSize,
    logoSize,
  };
}

/** Legend stops for the phone color scale. Daily moves use a tighter range. */
export function heatmapScaleStops(returnType: ReturnType): number[] {
  return returnType === "daily"
    ? [-0.08, -0.05, -0.02, 0, 0.02, 0.05, 0.08]
    : [-0.5, -0.25, -0.1, 0, 0.1, 0.25, 0.5];
}
