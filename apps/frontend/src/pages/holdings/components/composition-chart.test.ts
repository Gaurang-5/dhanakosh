import { describe, expect, it } from "vitest";

import { heatmapScaleStops, mobileSectorChrome, mobileTileLayout } from "./composition-mobile";
import { shouldShowCompositionLogo } from "./composition-logo";

describe("composition heatmap logos", () => {
  it("shows logos only when a tile can fit the logo, label, and return", () => {
    expect(shouldShowCompositionLogo(120, 90, "HDFCAMC")).toBe(true);
    expect(shouldShowCompositionLogo(60, 90, "HDFCAMC")).toBe(false);
    expect(shouldShowCompositionLogo(120, 60, "HDFCAMC")).toBe(false);
  });

  it("does not reserve logo space without an avatar identity", () => {
    expect(shouldShowCompositionLogo(120, 120, "")).toBe(false);
  });
});

describe("mobile composition heatmap", () => {
  it("stacks a logo, ticker, and return on a large tile", () => {
    expect(mobileTileLayout(160, 120, true)).toMatchObject({
      showLogo: true,
      showSymbol: true,
      showPercent: true,
    });
  });

  it("drops the ticker before the logo on a medium tile", () => {
    expect(mobileTileLayout(101, 40, true)).toMatchObject({
      showLogo: true,
      showSymbol: false,
      showPercent: true,
    });
    expect(mobileTileLayout(70, 44, true)).toMatchObject({
      showLogo: true,
      showSymbol: false,
      showPercent: true,
    });
  });

  it("uses a logo alone on a small square", () => {
    expect(mobileTileLayout(24, 24, true)).toMatchObject({
      showLogo: true,
      showSymbol: false,
      showPercent: false,
    });
  });

  it("leaves a tiny swatch unlabeled", () => {
    expect(mobileTileLayout(16, 16, true)).toMatchObject({
      showLogo: false,
      showSymbol: false,
      showPercent: false,
    });
  });

  it("reserves a caption row only when the sector can show one", () => {
    expect(mobileSectorChrome(120, 80)).toMatchObject({ labeled: true, header: 14 });
    expect(mobileSectorChrome(24, 20)).toMatchObject({ labeled: false, header: 0 });
  });

  it("uses a tighter scale for daily moves", () => {
    expect(heatmapScaleStops("daily")[0]).toBe(-0.08);
    expect(heatmapScaleStops("pnl")[0]).toBe(-0.5);
  });
});
