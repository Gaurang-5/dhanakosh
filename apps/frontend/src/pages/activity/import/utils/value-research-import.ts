export type ValueResearchCell = string | number | boolean | Date | null | undefined;

const CANONICAL_HEADERS = [
  "date",
  "symbol",
  "isin",
  "activityType",
  "quantity",
  "unitPrice",
  "amount",
  "currency",
  "fee",
  "comment",
] as const;

const ACTIVITY_TYPES = new Map([
  ["sip investment", "BUY"],
  ["investment in fund", "BUY"],
  ["switch investment", "BUY"],
  ["investment in stock", "BUY"],
  ["purchase", "BUY"],
  ["sell/redemption", "SELL"],
  ["switch redemption", "SELL"],
  ["dividend", "DIVIDEND"],
  ["investment in ppf", "DEPOSIT"],
  ["interest accrued", "INTEREST"],
]);

const SYMBOL_HEADERS = ["Scheme Name", "Stock/ETF Name", "REIT/InvIT Name", "PPF A/C Name"];
const REFERENCE_HEADERS = ["Folio Number", "Demat A/c", "PPF A/C Name"];

function cellText(value: ValueResearchCell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function dateText(value: ValueResearchCell): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.trunc(value) * 86_400_000);
    return date.toISOString().slice(0, 10);
  }
  const raw = cellText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/.exec(raw);
  if (!match) return raw;
  const months = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const month = months.indexOf(match[2].toLowerCase());
  if (month === -1) return raw;
  const shortYear = Number(match[3]);
  const year = match[3].length === 2 ? (shortYear >= 70 ? 1900 : 2000) + shortYear : shortYear;
  return `${year}-${String(month + 1).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function magnitudeText(value: ValueResearchCell): string {
  const raw = cellText(value).replace(/[₹,\s]/g, "");
  if (!raw || raw === "-" || raw === "--") return "";
  return raw.startsWith("-") ? raw.slice(1) : raw.startsWith("+") ? raw.slice(1) : raw;
}

function numericValue(value: ValueResearchCell): number | undefined {
  const normalized = magnitudeText(value);
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function inferredPpfInterestAmount(
  rows: readonly ValueResearchCell[][],
  rowIndex: number,
  column: ReadonlyMap<string, number>,
): string {
  const balanceColumn = column.get("Balance Amount");
  const dateColumn = column.get("Transaction Date");
  if (balanceColumn === undefined || dateColumn === undefined) return "";

  const currentBalance = numericValue(rows[rowIndex]?.[balanceColumn]);
  if (currentBalance === undefined) return "";

  const transactionRows = rows
    .map((row, index) => ({
      index,
      date: Date.parse(dateText(row[dateColumn])),
      balance: numericValue(row[balanceColumn]),
    }))
    .filter(
      (row) =>
        row.index !== rowIndex &&
        Number.isFinite(row.date) &&
        row.date < Date.parse(dateText(rows[rowIndex]?.[dateColumn])) &&
        row.balance !== undefined,
    )
    .sort((left, right) => right.date - left.date);

  const priorBalance = transactionRows[0]?.balance;
  if (priorBalance === undefined) return "";
  const difference = Math.round((currentBalance - priorBalance) * 100) / 100;
  return difference > 0 ? String(difference) : "";
}

function findHeaderIndex(rows: readonly ValueResearchCell[][]): number {
  return rows.findIndex((row) => {
    const headers = new Set(row.map(cellText));
    return (
      headers.has("Transaction Date") &&
      headers.has("Transaction Type") &&
      headers.has("Amount") &&
      SYMBOL_HEADERS.some((header) => headers.has(header))
    );
  });
}

/**
 * Converts a Value Research transaction-history worksheet into the app's
 * canonical activity CSV shape. Returns null for ordinary Excel worksheets.
 */
export function normalizeValueResearchRows(
  rows: readonly ValueResearchCell[][],
  sheetName: string,
): ValueResearchCell[][] | null {
  const headerIndex = findHeaderIndex(rows);
  if (headerIndex === -1) return null;

  const headers = rows[headerIndex].map(cellText);
  const column = new Map(headers.map((header, index) => [header, index]));
  const symbolHeader = SYMBOL_HEADERS.find((header) => column.has(header));
  if (!symbolHeader) return null;
  const isPpfSheet = symbolHeader === "PPF A/C Name";
  const referenceHeader = REFERENCE_HEADERS.find((header) => column.has(header));
  const quantityHeader = column.has("Units") ? "Units" : column.has("Quantity") ? "Quantity" : null;
  const unitPriceHeader = column.has("NAV") ? "NAV" : column.has("Price") ? "Price" : null;

  const value = (row: readonly ValueResearchCell[], header: string | null | undefined) =>
    header === null || header === undefined ? "" : row[column.get(header) ?? -1];

  const normalized: ValueResearchCell[][] = [[...CANONICAL_HEADERS]];
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row?.some((cell) => cellText(cell))) continue;

    const sourceType = cellText(value(row, "Transaction Type"));
    const sourceDate = cellText(value(row, "Transaction Date"));
    if (!sourceType) {
      if (/total$/i.test(sourceDate)) continue;
      continue;
    }

    const reference = cellText(value(row, referenceHeader));
    const referenceComment =
      referenceHeader && reference ? `; ${referenceHeader}: ${reference}` : "";
    const activityType = ACTIVITY_TYPES.get(sourceType.toLowerCase()) ?? sourceType;
    const isTrade = activityType === "BUY" || activityType === "SELL";
    const sourceAmount = magnitudeText(value(row, "Amount"));
    const amount =
      isPpfSheet && activityType === "INTEREST" && !sourceAmount
        ? inferredPpfInterestAmount(rows, index, column)
        : sourceAmount;
    normalized.push([
      dateText(value(row, "Transaction Date")),
      isPpfSheet ? "" : cellText(value(row, symbolHeader)),
      cellText(value(row, "ISIN")),
      activityType,
      isTrade ? magnitudeText(value(row, quantityHeader)) : "",
      isTrade ? magnitudeText(value(row, unitPriceHeader)) : "",
      amount,
      "INR",
      magnitudeText(value(row, "Brokerage")),
      `Value Research; ${sheetName}; row ${index + 1}; ${sourceType}${referenceComment}`,
    ]);
  }

  return normalized;
}
