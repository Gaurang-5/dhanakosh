import { prepareInvestmentTableRows } from "./investment-table";

/** Keep unknown CSVs byte-for-byte; only remove a recognized report preamble. */
export async function prepareInvestmentCsv(file: File): Promise<File> {
  if (file.size > 10 * 1024 * 1024) return file;
  let text: string;
  try {
    // The native parser already supports legacy encodings. Do not replace them
    // with lossy UTF-8 decoding in this optional local preparation step.
    text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    return file;
  }
  // SheetJS is permissive about unclosed CSV strings. Let the native parser
  // report malformed quoting rather than folding several executions into one.
  if ((text.match(/"/g)?.length ?? 0) % 2 !== 0) return file;
  const { read, utils } = await import("xlsx");
  const book = read(text, { type: "string", raw: true });
  const sheet = book.Sheets[book.SheetNames[0]];
  if (!sheet?.["!ref"]) return file;
  const range = utils.decode_range(sheet["!ref"]);
  if ((range.e.r + 1) * (range.e.c + 1) > 1_000_000) return file;
  const rows = utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
    blankrows: true,
  });
  const prepared = prepareInvestmentTableRows(rows);
  if (!prepared) return file;
  return new File(
    [utils.sheet_to_csv(utils.aoa_to_sheet(prepared), { blankrows: true })],
    file.name,
    { type: "text/csv" },
  );
}
