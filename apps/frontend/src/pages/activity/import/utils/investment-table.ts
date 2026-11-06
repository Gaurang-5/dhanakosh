import { ImportFormat } from "@/lib/constants";

export type InvestmentCell = string | number | boolean | Date | null | undefined;

interface InvestmentTable {
  headerRowIndex: number;
  fieldMappings: Partial<Record<ImportFormat, string>>;
}

// Exact aliases only. In particular, settlement dates, market values and net
// proceeds must not win over execution dates, execution prices and gross amounts.
const TRADE_COLUMNS: Partial<Record<ImportFormat, readonly string[]>> = {
  date: ["trade date", "transaction date", "activity date", "date"],
  activityType: [
    "trade type",
    "buy/sell",
    "buy / sell",
    "transaction type",
    "activity type",
    "action",
    "side",
  ],
  symbol: ["symbol", "ticker", "trading symbol", "stock symbol", "security symbol"],
  isin: ["isin"],
  quantity: ["quantity", "qty", "shares", "units"],
  unitPrice: ["trade price", "execution price", "unit price", "price", "rate", "nav"],
  amount: ["gross amount", "trade value", "transaction amount", "amount"],
  currency: ["currency", "trade currency", "currency code", "ccy"],
  fee: ["fee", "fees", "commission", "brokerage"],
  tax: ["withholding tax", "tax withheld", "tax"],
  comment: ["comment", "notes", "description"],
};

function headerKey(value: InvestmentCell): string {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\s]+/g, " ")
    .toLowerCase();
}

/** Recognize a transaction table, not a broker brand or an entire statement. */
export function detectInvestmentTable(rows: readonly InvestmentCell[][]): InvestmentTable | null {
  const matches: InvestmentTable[] = [];
  // A report title is common, but scanning every transaction for headers is not
  // necessary. Reject multiple tables rather than silently importing just one.
  for (let index = 0; index < Math.min(rows.length, 50); index += 1) {
    const row = rows[index];
    const keys = row.map(headerKey);
    const nonempty = keys.filter(Boolean);
    if (new Set(nonempty).size !== nonempty.length) continue;

    const fieldMappings: InvestmentTable["fieldMappings"] = {};
    for (const [field, aliases] of Object.entries(TRADE_COLUMNS)) {
      const alias = aliases.find((candidate) => keys.includes(candidate));
      if (alias) fieldMappings[field as ImportFormat] = String(row[keys.indexOf(alias)]).trim();
    }
    if (
      fieldMappings.date &&
      fieldMappings.activityType &&
      (fieldMappings.symbol || fieldMappings.isin) &&
      fieldMappings.quantity &&
      fieldMappings.unitPrice
    ) {
      matches.push({ headerRowIndex: index, fieldMappings });
    }
  }
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Strip only a proven report preamble. Preserve every following row and original
 * column, including malformed values and totals, for the existing review flow.
 * Multiple tables or nonempty extra columns are left for manual configuration.
 */
export function prepareInvestmentTableRows(
  rows: readonly InvestmentCell[][],
): InvestmentCell[][] | null {
  const table = detectInvestmentTable(rows);
  if (!table || table.headerRowIndex === 0) return null;
  const header = rows[table.headerRowIndex];
  const width = header.reduce<number>(
    (last, cell, index) => (String(cell ?? "").trim() ? index + 1 : last),
    0,
  );
  if (
    rows
      .slice(table.headerRowIndex + 1)
      .some((row) => row.slice(width).some((cell) => String(cell ?? "").trim()))
  ) {
    return null;
  }
  return rows.slice(table.headerRowIndex).map((row) => [...row]);
}
