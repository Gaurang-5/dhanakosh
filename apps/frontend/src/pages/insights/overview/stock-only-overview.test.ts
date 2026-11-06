import { describe, expect, it } from "vitest";
import type { ExposureView } from "@/adapters/shared/fund-exposure";
import type { Asset } from "@/lib/types";
import { buildStockOnlyOverview } from "./stock-only-overview";

describe("stock-only overview", () => {
  it("combines direct and fund exposure and omits the fund itself", () => {
    const view: ExposureView = {
      currency: "INR",
      positions: [],
      snapshots: [
        {
          assetId: "fund",
          source: "BHARATSTOCK",
          asOf: "2026-09-01",
          fetchedAt: "2026-10-01",
          imported: false,
          constituents: [
            { identifier: "NSE:ABC", name: "ABC", sector: "Technology", weightPercent: "50" },
          ],
        },
      ],
      report: {
        contributions: [
          {
            identifier: "NSE:ABC",
            name: "ABC",
            assetId: "stock",
            accountId: "account",
            viaFund: null,
            source: null,
            asOf: null,
            value: "100",
          },
          {
            identifier: "NSE:ABC",
            name: "ABC",
            assetId: "fund",
            accountId: "account",
            viaFund: "Value Fund",
            source: "BHARATSTOCK",
            asOf: "2026-09-01",
            value: "40",
          },
        ],
        unexpandedValue: "60",
        uncoveredFunds: [],
      },
    };
    const result = buildStockOnlyOverview(view, []);

    expect(result.holdings).toHaveLength(1);
    expect(result.holdings[0].marketValue.base).toBe(140);
    expect(result.holdings[0].instrument?.name).toBe("ABC");
    expect(result.holdings[0].instrument?.exchangeMic).toBe("XNSE");
    expect(result.allocations.sectors.categories[0].categoryName).toBe("Information Technology");
    expect(result.sectorByHoldingId[result.holdings[0].id]).toBe("Information Technology");
    expect(result.unexpandedValue).toBe(60);
  });
  it("uses NSE sector data for constituents without disclosure sectors", () => {
    const view: ExposureView = {
      currency: "INR",
      positions: [],
      snapshots: [],
      report: {
        contributions: [
          {
            identifier: "NSE:HDFCBANK",
            name: "HDFC Bank Limited",
            assetId: "fund",
            accountId: "account",
            viaFund: "Fund",
            source: "BHARATSTOCK",
            asOf: "2026-09-01",
            value: "100",
          },
        ],
        unexpandedValue: "0",
        uncoveredFunds: [],
      },
    };
    const result = buildStockOnlyOverview(view, []);
    expect(result.sectorByHoldingId[result.holdings[0].id]).toBe("Financial Services");
    expect(result.allocations.sectors.categories[0].categoryName).toBe("Financial Services");
  });
  it("maps an ISIN-only fund constituent to its NSE ticker for live logos", () => {
    const view: ExposureView = {
      currency: "INR",
      positions: [],
      snapshots: [],
      report: {
        contributions: [
          {
            identifier: "INE467B01029",
            name: "Tata Consultancy Services",
            assetId: "fund",
            accountId: "account",
            viaFund: "Fund",
            source: "BHARATSTOCK",
            asOf: "2026-09-01",
            value: "100",
          },
        ],
        unexpandedValue: "0",
        uncoveredFunds: [],
      },
    };
    const result = buildStockOnlyOverview(view, []);
    expect(result.holdings[0].instrument).toMatchObject({
      symbol: "TCS",
      name: "Tata Consultancy Services",
      exchangeMic: "XNSE",
    });
  });
  it("shows a listed REIT by ticker when its fund disclosure only has an ISIN", () => {
    const view: ExposureView = {
      currency: "INR",
      positions: [],
      snapshots: [],
      report: {
        contributions: [
          {
            identifier: "INE0NDH25011",
            name: "Nexus Select Trust REIT",
            assetId: "fund",
            accountId: "account",
            viaFund: "Fund",
            source: "BHARATSTOCK",
            asOf: "2026-09-01",
            value: "6125.82",
          },
        ],
        unexpandedValue: "0",
        uncoveredFunds: [],
      },
    };
    const asset = {
      id: "reit",
      kind: "INVESTMENT",
      name: "Nexus Select Trust",
      quoteMode: "MARKET",
      quoteCcy: "INR",
      instrumentSymbol: "NXST",
      instrumentExchangeMic: "XNSE",
      metadata: { isin: "INE0NDH25011" },
      createdAt: "2026-11-01T00:00:00Z",
      updatedAt: "2026-11-01T00:00:00Z",
    } satisfies Asset;
    const result = buildStockOnlyOverview(view, [], "INR", 1, [asset]);
    expect(result.holdings[0].instrument).toMatchObject({
      id: "reit",
      symbol: "NXST",
      name: "Nexus Select Trust",
      exchangeMic: "XNSE",
    });
    expect(result.sectorByHoldingId[result.holdings[0].id]).toBe("Realty");

    const withDirectShares: ExposureView = {
      ...view,
      report: {
        ...view.report,
        contributions: [
          {
            identifier: "INE0NDH25011",
            name: "Nexus Select Trust",
            assetId: "reit",
            accountId: "account",
            viaFund: null,
            source: null,
            asOf: null,
            value: "50073.74",
          },
          ...view.report.contributions,
        ],
      },
    };
    const combined = buildStockOnlyOverview(withDirectShares, [], "INR", 1, [asset]);
    expect(combined.holdings).toHaveLength(1);
    expect(combined.holdings[0].marketValue.base).toBe(56199.56);
    expect(combined.holdings[0].instrument?.symbol).toBe("NXST");
  });
});
