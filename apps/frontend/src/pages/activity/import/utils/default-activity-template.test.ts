import { describe, expect, it } from "vitest";
import { createDraftActivities, validateDraft } from "./draft-utils";
import { ActivityType } from "@/lib/constants";
import type { ImportTemplateData } from "@/lib/types";
import {
  DEFAULT_ACTIVITY_TEMPLATE_ID,
  createDefaultActivityMapping,
  createInvestmentImportPresets,
  isBuiltinActivityTemplateId,
  createDefaultParseConfig,
  createDefaultActivityTemplate,
  createEmptyHoldingsMapping,
  prependDefaultActivityTemplate,
} from "./default-activity-template";

describe("default-activity-template", () => {
  it("maps Zerodha equity fees and order ids when those columns exist", () => {
    const template = createInvestmentImportPresets()[0];
    expect(template.fieldMappings).toEqual({
      date: "trade_date",
      activityType: "trade_type",
      symbol: "symbol",
      isin: "isin",
      exchange: "exchange",
      quantity: "quantity",
      unitPrice: "price",
      fee: "brokerage",
      comment: "order_id",
    });
    expect(template.parseConfig?.defaultCurrency).toBe("INR");
    expect(template.activityMappings.BUY).toContain("buy");
    expect(template.activityMappings.SELL).toContain("sell");
  });

  it("maps Coin tradebook columns without preselecting an account or fund", () => {
    const template = createInvestmentImportPresets().find(
      (preset) => preset.id === "system_zerodha_mutual_fund_tradebook",
    );
    expect(template?.fieldMappings).toEqual({
      date: "trade_date",
      activityType: "trade_type",
      symbol: "symbol",
      isin: "isin",
      quantity: "quantity",
      unitPrice: "price",
    });
    expect(template?.parseConfig?.defaultCurrency).toBe("INR");
    expect(template?.activityMappings.BUY).toContain("buy");
    expect(template?.activityMappings.SELL).toContain("sell");
    expect(template?.accountMappings).toEqual({});
    expect(template?.symbolMappings).toEqual({});
  });

  it("preserves fractional Coin units, ISIN and the selected destination account", () => {
    const template = createInvestmentImportPresets().find(
      (preset) => preset.id === "system_zerodha_mutual_fund_tradebook",
    )!;
    const headers = ["symbol", "isin", "trade_date", "trade_type", "quantity", "price"];
    const rows = [
      ["EXAMPLE FUND - DIRECT GROWTH", "INF179K01XQ0", "2026-02-06", "buy", "1.234", "123.45"],
      ["EXAMPLE FUND - DIRECT GROWTH", "INF179K01XQ0", "2026-02-07", "sell", "0.234", "125.00"],
    ];
    const drafts = createDraftActivities(
      rows,
      headers,
      template,
      { ...createDefaultParseConfig("INR"), ...template.parseConfig },
      "zerodha-selected",
    );
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({
      accountId: "zerodha-selected",
      activityType: "BUY",
      currency: "INR",
      symbol: "EXAMPLE FUND - DIRECT GROWTH",
      isin: "INF179K01XQ0",
      quantity: "1.234",
      unitPrice: "123.45",
    });
    expect(drafts[1]).toMatchObject({
      accountId: "zerodha-selected",
      activityType: "SELL",
      quantity: "0.234",
    });
  });

  it("does not treat local template IDs as persisted database IDs", () => {
    for (const preset of createInvestmentImportPresets()) {
      expect(isBuiltinActivityTemplateId(preset.id)).toBe(true);
    }
    expect(isBuiltinActivityTemplateId("saved-template-id")).toBe(false);
    expect(isBuiltinActivityTemplateId(null)).toBe(false);
    const presets = createInvestmentImportPresets();
    const merged = prependDefaultActivityTemplate(presets);
    expect(new Set(merged.map((item) => item.id)).size).toBe(merged.length);
  });

  it.each(Object.values(ActivityType).filter((type) => type !== ActivityType.UNKNOWN))(
    "includes canonical %s identity mappings",
    (type) => {
      expect(createDefaultActivityTemplate().activityMappings[type]).toEqual([type]);
    },
  );

  it("includes SPLIT in the code-defined default baseline", () => {
    expect(createDefaultActivityTemplate().activityMappings[ActivityType.SPLIT]).toEqual([
      ActivityType.SPLIT,
    ]);
  });

  it("creates a clean default activity mapping state", () => {
    expect(createDefaultActivityMapping("acc-1")).toMatchObject({
      accountId: "acc-1",
      name: "",
      fieldMappings: {},
      symbolMappings: {},
      accountMappings: {},
    });
  });

  it("creates the baseline parse config for no-template imports", () => {
    expect(createDefaultParseConfig("CAD")).toMatchObject({
      delimiter: "auto",
      dateFormat: "auto",
      skipTopRows: 0,
      skipBottomRows: 0,
      defaultCurrency: "CAD",
    });
  });

  it("creates an empty holdings mapping for template clear/reset", () => {
    expect(createEmptyHoldingsMapping("acc-1")).toMatchObject({
      accountId: "acc-1",
      importType: "CSV_HOLDINGS",
      fieldMappings: {},
      symbolMappings: {},
    });
  });

  it("prepends the code-defined default template once", () => {
    const templates: ImportTemplateData[] = [
      createDefaultActivityTemplate(),
      {
        id: "user-template",
        name: "Broker CSV",
        scope: "USER",
        kind: "CSV_ACTIVITY",
        fieldMappings: {},
        activityMappings: {},
        symbolMappings: {},
        accountMappings: {},
        symbolMappingMeta: {},
      },
    ];

    const merged = prependDefaultActivityTemplate(templates);

    expect(merged[0]?.id).toBe(DEFAULT_ACTIVITY_TEMPLATE_ID);
    expect(merged.filter((template) => template.id === DEFAULT_ACTIVITY_TEMPLATE_ID)).toHaveLength(
      1,
    );
  });

  it("imports a Zerodha equity row on NSE and a listed ETF without an AMFI code", () => {
    const template = createInvestmentImportPresets()[0];
    const headers = [
      "symbol",
      "isin",
      "trade_date",
      "exchange",
      "segment",
      "series",
      "trade_type",
      "auction",
      "quantity",
      "price",
      "trade_id",
      "order_id",
      "order_execution_time",
    ];
    const rows = [
      [
        "TCS",
        "INE467B01029",
        "2021-11-08",
        "BSE",
        "EQ",
        "A",
        "buy",
        "false",
        "4.000000",
        "3129.399902",
        "5224059",
        "4641914954433051976",
        "2021-11-08T12:43:39",
      ],
      [
        "MONIFTY500",
        "INF247L01BU1",
        "2021-11-16",
        "NSE",
        "EQ",
        "EQ",
        "buy",
        "false",
        "450.000000",
        "22.150000",
        "456771963",
        "1108531358580900",
        "2021-11-16T15:07:54",
      ],
    ];
    const drafts = createDraftActivities(
      rows,
      headers,
      template,
      { ...createDefaultParseConfig("INR"), ...template.parseConfig },
      "zerodha-selected",
    );

    expect(drafts[0]).toMatchObject({
      symbol: "TCS",
      exchangeMic: "XBOM",
      comment: "4641914954433051976",
      status: "valid",
    });
    expect(drafts[1]).toMatchObject({
      symbol: "MONIFTY500",
      exchangeMic: "XNSE",
      status: "valid",
    });
    expect(validateDraft(drafts[0]).errors.symbol).toBeUndefined();
    expect(validateDraft(drafts[1]).errors.symbol).toBeUndefined();
  });

  it("keeps NSE and BSE fills of one ISIN on the NSE quote", () => {
    const template = createInvestmentImportPresets()[0];
    const headers = ["symbol", "isin", "trade_date", "exchange", "trade_type", "quantity", "price"];
    const drafts = createDraftActivities(
      [
        ["TCS", "INE467B01029", "2021-11-08", "BSE", "buy", "4", "3129.40"],
        ["TCS", "INE467B01029", "2021-11-10", "NSE", "buy", "2", "3168.70"],
      ],
      headers,
      template,
      { ...createDefaultParseConfig("INR"), ...template.parseConfig },
      "zerodha-selected",
    );

    expect(drafts.map((draft) => draft.exchangeMic)).toEqual(["XNSE", "XNSE"]);
    expect(drafts[0]?.assetCandidateKey).toBe(drafts[1]?.assetCandidateKey);
    expect(drafts.every((draft) => draft.status === "valid")).toBe(true);
  });
});
