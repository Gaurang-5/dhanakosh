import { describe, expect, it } from "vitest";
import { getTickerLogoPaths } from "@wealthfolio/ui";

describe("Indian company logo fallback", () => {
  it.each(["LICI.NS", "NSE:LICI", "LICI-XNSE"])("resolves %s without a US logo", (symbol) => {
    expect(getTickerLogoPaths(symbol)).toEqual([
      "https://api.dharun.dev/v1/logos/NSE%3ALICI?format=png&size=128",
      "/ticker-logos/LICI-XNSE.png",
    ]);
  });
  it("supports arbitrary NSE listings, not a portfolio-specific allowlist", () => {
    expect(getTickerLogoPaths("NXST", "XNSE")).toEqual(["/ticker-logos/NXST-XNSE.ico"]);
    expect(getTickerLogoPaths("NEWSTOCK", "XNSE")).toEqual([
      "https://api.dharun.dev/v1/logos/NSE%3ANEWSTOCK?format=png&size=128",
      "/ticker-logos/NEWSTOCK-XNSE.png",
    ]);
  });
  it("looks up Indian equity ISINs when no exchange ticker is available", () => {
    expect(getTickerLogoPaths("INE467B01029")).toEqual([
      "https://api.dharun.dev/v1/logos/INE467B01029?format=png&size=128",
    ]);
  });
  it("preserves BSE identity and escapes symbols", () => {
    expect(getTickerLogoPaths("M&M", "XBOM")[0]).toBe(
      "https://api.dharun.dev/v1/logos/BSE%3AM%26M?format=png&size=128",
    );
    expect(getTickerLogoPaths("532540", "XBOM")).toContain("/ticker-logos/532540-XBOM.png");
  });
  it.each([
    ["NXST", "XNAS"],
    ["NXST", undefined],
    ["../LICI", "XNSE"],
    ["CASH:INR", undefined],
  ])("does not request Indian logos for %s / %s", (symbol, mic) => {
    expect(getTickerLogoPaths(symbol, mic).some((url) => url.startsWith("https://"))).toBe(false);
  });
});
