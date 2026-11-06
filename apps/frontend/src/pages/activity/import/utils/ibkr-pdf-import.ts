const MAX_PDF_BYTES = 10 * 1024 * 1024;

interface PdfTextItem {
  str: string;
  transform: number[];
}

interface IbkrSecurity {
  name: string;
  isin: string;
  listingExchange: string;
}

interface IbkrTrade {
  account: string;
  symbol: string;
  date: string;
  time: string;
  settleDate: string;
  exchange: string;
  activityType: "BUY" | "SELL";
  quantity: string;
  unitPrice: string;
  commission: string;
  fee: string;
  currency: string;
}

const TRADE_LINE =
  /^(U\d+)\s+(\S+)\s+(\d{4}-\d{2}-\d{2}),\s+(\d{2}:\d{2}:\d{2})\s+(\d{4}-\d{2}-\d{2})\s+(\S+)\s+(BUY|SELL)\s+(-?[\d,.]+)\s+([\d,.]+)\s+(-?[\d,.]+)\s+(-?[\d,.]+)\s+(-?[\d,.]+)/i;
const SECURITY_LINE =
  /^(\S+)\s+(.+?)\s+(\d+)\s+([A-Z]{2}[A-Z0-9]{10})\s+\S+\s+(\S+)\s+[\d,.]+\s+\S+/;

const LISTING_EXCHANGE_TO_MIC: Record<string, string> = {
  NASDAQ: "XNAS",
  NYSE: "XNYS",
  ARCA: "ARCX",
  AMEX: "XASE",
  LSE: "XLON",
  TSE: "XTSE",
};

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function numberValue(value: string): number {
  return Number(value.replaceAll(",", ""));
}

function normalizeNumber(value: string): string {
  const number = Math.abs(numberValue(value));
  return Number.isFinite(number) ? String(number) : "";
}

function tradeIdentity(trade: IbkrTrade): string {
  return [
    trade.account,
    trade.symbol,
    trade.date,
    trade.time,
    trade.settleDate,
    trade.activityType,
    trade.quantity,
    trade.unitPrice,
    trade.commission,
    trade.fee,
    trade.currency,
  ].join("\u0000");
}

/** Reconstruct visual PDF text items into stable reading-order lines. */
export function pdfTextItemsToLines(items: PdfTextItem[]): string[] {
  const rotated =
    items.filter((item) => Math.abs(item.transform[1] ?? 0) > Math.abs(item.transform[0] ?? 0))
      .length >
    items.length / 2;
  const rows: Array<{ coordinate: number; cells: Array<{ coordinate: number; text: string }> }> =
    [];
  for (const item of items) {
    const text = item.str.trim();
    if (!text) continue;
    const rowCoordinate = item.transform[rotated ? 4 : 5] ?? 0;
    const cellCoordinate = item.transform[rotated ? 5 : 4] ?? 0;
    let row = rows.find((candidate) => Math.abs(candidate.coordinate - rowCoordinate) <= 1.5);
    if (!row) {
      row = { coordinate: rowCoordinate, cells: [] };
      rows.push(row);
    }
    row.cells.push({ coordinate: cellCoordinate, text });
  }

  return rows
    .sort((a, b) => (rotated ? a.coordinate - b.coordinate : b.coordinate - a.coordinate))
    .map((row) =>
      row.cells
        .sort((a, b) => a.coordinate - b.coordinate)
        .map((cell) => cell.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

export function parseIbkrTradeConfirmationLines(lines: string[]): string {
  const securities = new Map<string, IbkrSecurity>();
  const trades: IbkrTrade[] = [];
  const lastTradeByIdentity = new Map<string, number>();
  let currency = "USD";

  for (const line of lines) {
    if (/^[A-Z]{3}$/.test(line)) currency = line;

    const securityMatch = SECURITY_LINE.exec(line);
    if (securityMatch) {
      securities.set(securityMatch[1], {
        name: securityMatch[2],
        isin: securityMatch[4],
        listingExchange: securityMatch[5],
      });
      continue;
    }

    const match = TRADE_LINE.exec(line);
    if (!match) continue;
    const trade: IbkrTrade = {
      account: match[1],
      symbol: match[2],
      date: match[3],
      time: match[4],
      settleDate: match[5],
      exchange: match[6],
      activityType: match[7].toUpperCase() as "BUY" | "SELL",
      quantity: normalizeNumber(match[8]),
      unitPrice: normalizeNumber(match[9]),
      commission: match[11],
      fee: match[12],
      currency,
    };
    if (!trade.quantity || !trade.unitPrice) continue;

    // Advisor confirmations mirror each execution with exchange '-' and 'IBKR'. Collapse only
    // that pair; genuinely repeated executions on the same exchange remain separate rows.
    const identity = tradeIdentity(trade);
    const previousIndex = lastTradeByIdentity.get(identity);
    const previous = previousIndex === undefined ? undefined : trades[previousIndex];
    if (
      previous &&
      previous.exchange !== trade.exchange &&
      [previous.exchange, trade.exchange].includes("-")
    ) {
      if (previous.exchange === "-") trades[previousIndex!] = trade;
      continue;
    }
    lastTradeByIdentity.set(identity, trades.length);
    trades.push(trade);
  }

  if (!trades.length) throw new Error("ibkrPdfInvalid");

  const headers = [
    "date",
    "account",
    "activityType",
    "symbol",
    "isin",
    "quantity",
    "unitPrice",
    "amount",
    "currency",
    "fee",
    "comment",
    "instrumentType",
    "exchangeMic",
  ];
  const rows = trades.map((trade) => {
    const security = securities.get(trade.symbol);
    const combinedFee = Math.abs(numberValue(trade.commission)) + Math.abs(numberValue(trade.fee));
    const exchangeMic = security
      ? (LISTING_EXCHANGE_TO_MIC[security.listingExchange.toUpperCase()] ?? "")
      : "";
    const comment = [
      "IBKR trade confirmation",
      `account ${trade.account}`,
      `trade time ${trade.time} ET`,
      `settle ${trade.settleDate}`,
      security?.name,
    ]
      .filter(Boolean)
      .join("; ");
    return [
      trade.date,
      trade.account,
      trade.activityType,
      trade.symbol,
      security?.isin ?? "",
      trade.quantity,
      trade.unitPrice,
      "",
      trade.currency,
      combinedFee > 0 ? String(combinedFee) : "",
      comment,
      "EQUITY",
      exchangeMic,
    ];
  });

  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

export async function readIbkrTradeConfirmation(file: File): Promise<File> {
  if (file.size > MAX_PDF_BYTES) throw new Error("ibkrPdfTooLarge");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
    throw new Error("ibkrPdfInvalid");
  }

  const [{ getDocument, GlobalWorkerOptions }, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  GlobalWorkerOptions.workerSrc = worker.default;
  const loadingTask = getDocument({ data: bytes });
  const document = await loadingTask.promise;
  const lines: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      lines.push(
        ...pdfTextItemsToLines(
          content.items.flatMap((item) =>
            "str" in item && "transform" in item
              ? [{ str: item.str, transform: Array.from(item.transform) }]
              : [],
          ),
        ),
      );
    }
  } finally {
    await loadingTask.destroy();
  }

  const csv = parseIbkrTradeConfirmationLines(lines);
  return new File([csv], `${file.name.replace(/\.pdf$/i, "")}-ibkr-trades.csv`, {
    type: "text/csv",
  });
}
