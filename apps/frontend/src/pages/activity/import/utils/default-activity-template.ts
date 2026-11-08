import type { ImportMappingData, ImportTemplateData } from "@/lib/types";
import { ImportType } from "@/lib/types";
import type { ParseConfig } from "../context";
import {
  DEFAULT_ACTIVITY_IMPORT_PROFILE,
  getDefaultActivityMappingsForImportProfile,
  type ActivityImportProfile,
} from "./activity-import-profile";

import { ActivityType, ImportFormat } from "@/lib/constants";

export const DEFAULT_ACTIVITY_TEMPLATE_ID = "system_default_activity";

export function createDefaultParseConfig(defaultCurrency = "USD"): ParseConfig {
  return {
    hasHeaderRow: true,
    headerRowIndex: 0,
    delimiter: "auto",
    skipTopRows: 0,
    skipBottomRows: 0,
    skipEmptyRows: true,
    dateFormat: "auto",
    decimalSeparator: "auto",
    thousandsSeparator: "auto",
    defaultCurrency,
  };
}

export function createDefaultActivityTemplate(
  profile: ActivityImportProfile = DEFAULT_ACTIVITY_IMPORT_PROFILE,
): ImportTemplateData {
  return {
    id: DEFAULT_ACTIVITY_TEMPLATE_ID,
    name: "Default",
    scope: "SYSTEM",
    kind: ImportType.ACTIVITY,
    fieldMappings: {},
    activityMappings: getDefaultActivityMappingsForImportProfile(profile),
    symbolMappings: {},
    accountMappings: {},
    symbolMappingMeta: {},
  };
}

/** Code-defined presets stay local; only user-saved templates have database IDs. */
export function createInvestmentImportPresets(): ImportTemplateData[] {
  const baseline = createDefaultActivityTemplate();
  return [
    {
      ...baseline,
      id: "system_zerodha_tradebook",
      name: "Zerodha equity tradebook (INR)",
      fieldMappings: {
        [ImportFormat.DATE]: "trade_date",
        [ImportFormat.ACTIVITY_TYPE]: "trade_type",
        [ImportFormat.SYMBOL]: "symbol",
        [ImportFormat.ISIN]: "isin",
        [ImportFormat.EXCHANGE]: "exchange",
        [ImportFormat.QUANTITY]: "quantity",
        [ImportFormat.UNIT_PRICE]: "price",
        [ImportFormat.FEE]: "brokerage",
        [ImportFormat.COMMENT]: "order_id",
      },
      activityMappings: {
        ...baseline.activityMappings,
        [ActivityType.BUY]: ["BUY", "buy"],
        [ActivityType.SELL]: ["SELL", "sell"],
      },
      parseConfig: { ...createDefaultParseConfig("INR"), dateFormat: "YYYY-MM-DD" },
    },
    {
      ...baseline,
      id: "system_zerodha_mutual_fund_tradebook",
      name: "Zerodha Coin mutual fund tradebook (INR)",
      fieldMappings: {
        [ImportFormat.DATE]: "trade_date",
        [ImportFormat.ACTIVITY_TYPE]: "trade_type",
        [ImportFormat.SYMBOL]: "symbol",
        [ImportFormat.ISIN]: "isin",
        [ImportFormat.QUANTITY]: "quantity",
        [ImportFormat.UNIT_PRICE]: "price",
      },
      activityMappings: {
        ...baseline.activityMappings,
        [ActivityType.BUY]: ["BUY", "buy"],
        [ActivityType.SELL]: ["SELL", "sell"],
      },
      parseConfig: { ...createDefaultParseConfig("INR"), dateFormat: "YYYY-MM-DD" },
    },
    {
      ...baseline,
      id: "system_india_activity",
      name: "India investments CSV (INR)",
      parseConfig: createDefaultParseConfig("INR"),
    },
    {
      ...baseline,
      id: "system_global_activity",
      name: "Global investments CSV (USD default)",
      parseConfig: createDefaultParseConfig("USD"),
    },
  ];
}

export function createDefaultActivityMapping(
  accountId = "",
  profile: ActivityImportProfile = DEFAULT_ACTIVITY_IMPORT_PROFILE,
): ImportMappingData {
  return {
    accountId,
    importType: ImportType.ACTIVITY,
    name: "",
    fieldMappings: {},
    activityMappings: createDefaultActivityTemplate(profile).activityMappings,
    symbolMappings: {},
    accountMappings: {},
    symbolMappingMeta: {},
  };
}

export function createEmptyHoldingsMapping(accountId = ""): ImportMappingData {
  return {
    accountId,
    importType: ImportType.HOLDINGS,
    name: "",
    fieldMappings: {},
    activityMappings: {},
    symbolMappings: {},
    accountMappings: {},
    symbolMappingMeta: {},
  };
}

export function prependDefaultActivityTemplate(
  templates: ImportTemplateData[],
  profile: ActivityImportProfile = DEFAULT_ACTIVITY_IMPORT_PROFILE,
): ImportTemplateData[] {
  const builtins = [
    createDefaultActivityTemplate(profile),
    ...(profile.kind === "investment" ? createInvestmentImportPresets() : []),
  ];
  const ids = new Set(builtins.map((template) => template.id));
  return [...builtins, ...templates.filter((template) => !ids.has(template.id))];
}

export function isDefaultActivityTemplateId(templateId: string | null): boolean {
  return templateId === DEFAULT_ACTIVITY_TEMPLATE_ID;
}

export function isBuiltinActivityTemplateId(id: string | null): boolean {
  return (
    id === DEFAULT_ACTIVITY_TEMPLATE_ID ||
    createInvestmentImportPresets().some((item) => item.id === id)
  );
}
