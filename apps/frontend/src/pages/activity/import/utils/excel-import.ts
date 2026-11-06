import type { CellObject, WorkBook } from "xlsx";
import { normalizeValueResearchRows, type ValueResearchCell } from "./value-research-import";
import { prepareInvestmentTableRows } from "./investment-table";

export interface ExcelImport {
  sheetNames: string[];
  toCsvFile: (sheetName: string, detectTransactionTable?: boolean) => File;
}

export async function readExcelImport(file: File): Promise<ExcelImport> {
  if (file.size > 10 * 1024 * 1024) throw new Error("excelTooLarge");
  const { read, utils } = await import("xlsx");
  const data = await file.arrayBuffer();
  const bytes = new Uint8Array(data);
  // Reject text disguised as Excel rather than letting the reader guess CSV.
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const ole = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  if (!zip && !ole) throw new Error("excelInvalid");
  const book: WorkBook = read(data, {
    type: "array",
    cellDates: true,
    cellText: false,
    dateNF: "yyyy-mm-dd",
  });
  const sheetNames = book.SheetNames.filter((name) => book.Sheets[name]?.["!ref"]);
  if (!sheetNames.length) throw new Error("excelEmpty");
  return {
    sheetNames,
    toCsvFile(sheetName, detectTransactionTable = true) {
      if (!sheetNames.includes(sheetName)) throw new Error("excelInvalid");
      const sheet = book.Sheets[sheetName];
      const range = utils.decode_range(sheet["!ref"]!);
      if ((range.e.r + 1) * (range.e.c + 1) > 1_000_000) throw new Error("excelTooLarge");
      const rows = utils.sheet_to_json<ValueResearchCell[]>(sheet, {
        header: 1,
        raw: true,
        defval: "",
        blankrows: true,
      });
      const valueResearchRows = normalizeValueResearchRows(rows, sheetName);
      const preparedRows =
        valueResearchRows ?? (detectTransactionTable ? prepareInvestmentTableRows(rows) : null);
      const outputSheet = preparedRows ? utils.aoa_to_sheet(preparedRows) : sheet;
      for (const address of Object.keys(outputSheet)) {
        if (address.startsWith("!")) continue;
        const cell = outputSheet[address] as CellObject;
        if (cell.t === "d") {
          cell.z = "yyyy-mm-dd";
          delete cell.w;
        }
      }
      // Use stored numeric values rather than rounded Excel display strings.
      const csv = utils.sheet_to_csv(outputSheet, {
        FS: ",",
        RS: "\n",
        blankrows: true,
        rawNumbers: true,
      });
      return new File([csv], `${file.name.replace(/\.xlsx?$/i, "")}-${sheetName}.csv`, {
        type: "text/csv",
      });
    },
  };
}
