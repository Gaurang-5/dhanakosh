import { describe, expect, it } from "vitest";
import { createDraftActivities } from "./draft-utils";
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
  it("maps Zerodha equity columns without inventing fees or order-ID support", () => {
    const template = createInvestmentImportPresets()[0];
    expect(template.fieldMappings).toEqual({
      date: "trade_date",
      activityType: "trade_type",
      symbol: "symbol",
      isin: "isin",
      quantity: "quantity",
      unitPrice: "price",
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
});
