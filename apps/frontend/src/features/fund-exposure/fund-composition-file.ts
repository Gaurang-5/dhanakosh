type Cell = string | number | boolean | Date | null | undefined;

const NAME_HEADERS = [
  "name",
  "holdingname",
  "name of the instrument",
  "name of instrument",
  "security name",
  "issuer name",
];
const WEIGHT_HEADERS = [
  "weightpercent",
  "weight",
  "% to net assets",
  "% to nav",
  "% of nav",
  "weight (%)",
  "percent",
];
const SECTOR_HEADERS = ["sector / rating", "sector", "industry*", "industry"];

function text(value: Cell): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalized(value: Cell): string {
  return text(value).toLowerCase().replace(/\s+/g, " ");
}

function findColumn(headers: readonly Cell[], candidates: readonly string[]): number {
  return headers.findIndex((header) => candidates.includes(normalized(header)));
}

function normalizeSheet(rows: readonly Cell[][]): Cell[][] | null {
  const headerIndex = rows.findIndex((row) => {
    const headers = row.map(normalized);
    return (
      headers.includes("isin") &&
      NAME_HEADERS.some((header) => headers.includes(header)) &&
      WEIGHT_HEADERS.some((header) => headers.includes(header))
    );
  });
  if (headerIndex === -1) return null;

  const headers = rows[headerIndex];
  const idColumn = findColumn(headers, ["identifier", "isin"]);
  const nameColumn = findColumn(headers, NAME_HEADERS);
  const weightColumn = findColumn(headers, WEIGHT_HEADERS);
  const sectorColumns = SECTOR_HEADERS.map((header) => findColumn(headers, [header])).filter(
    (column) => column >= 0,
  );
  const output: Cell[][] = [["identifier", "name", "weightPercent", "sector"]];

  for (const row of rows.slice(headerIndex + 1)) {
    const identifier = text(row[idColumn]).toUpperCase();
    const name = text(row[nameColumn]);
    const weight = text(row[weightColumn]).replace(/[%₹,\s]/g, "");
    const sector = sectorColumns.map((column) => text(row[column])).find(Boolean) ?? "";
    if (!identifier || !name || !weight || Number(weight) <= 0) continue;
    output.push([identifier, name, weight, sector]);
  }

  return output.length > 1 ? output : null;
}

const SCHEME_MATCH_STOP_WORDS = new Set([
  "direct",
  "regular",
  "growth",
  "plan",
  "option",
  "fund",
  "scheme",
  "the",
]);

function schemeMatchTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length > 2 && !SCHEME_MATCH_STOP_WORDS.has(token));
}

function schemeMatchScore(sheetName: string, rows: readonly Cell[][], schemeName: string): number {
  const wanted = schemeMatchTokens(schemeName);
  if (wanted.length === 0) return 0;
  const headingText = [sheetName, ...rows.slice(0, 12).flat().map(text)].join(" ").toLowerCase();
  return wanted.filter((token) => headingText.includes(token)).length;
}

export async function readFundCompositionFile(file: File, schemeName = ""): Promise<string> {
  if (/\.csv$/i.test(file.name)) {
    if (file.size > 2 * 1024 * 1024) {
      throw new Error("Composition CSV must be smaller than 2 MB.");
    }
    return file.text();
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Composition Excel file must be smaller than 10 MB.");
  }
  if (!/\.xlsx?$/i.test(file.name)) {
    throw new Error("Choose a CSV, XLS or XLSX issuer portfolio file.");
  }

  const { read, utils } = await import("xlsx");
  const data = await file.arrayBuffer();
  const bytes = new Uint8Array(data);
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const ole = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  if (!zip && !ole) throw new Error("The selected file is not a valid Excel workbook.");
  const book = read(data, { type: "array", cellDates: true, cellText: false });

  const candidates: { csv: string; score: number }[] = [];
  for (const sheetName of book.SheetNames) {
    const sheet = book.Sheets[sheetName];
    if (!sheet?.["!ref"]) continue;
    const rows = utils.sheet_to_json<Cell[]>(sheet, {
      header: 1,
      raw: true,
      defval: "",
      blankrows: true,
    });
    const normalizedRows = normalizeSheet(rows);
    if (normalizedRows) {
      candidates.push({
        csv: utils.sheet_to_csv(utils.aoa_to_sheet(normalizedRows), {
          FS: ",",
          RS: "\n",
          rawNumbers: true,
        }),
        score: schemeMatchScore(sheetName, rows, schemeName),
      });
    }
  }

  if (candidates.length === 1) return candidates[0].csv;
  if (candidates.length > 1 && schemeName) {
    const sorted = [...candidates].sort((left, right) => right.score - left.score);
    if (sorted[0].score > 0 && sorted[0].score > sorted[1].score) return sorted[0].csv;
  }
  if (candidates.length > 1) {
    throw new Error(
      "This workbook contains multiple schemes and the selected fund could not be matched safely. Choose a scheme-specific AMC portfolio file.",
    );
  }

  throw new Error(
    "Could not find ISIN, instrument name and portfolio-weight columns in this workbook.",
  );
}
