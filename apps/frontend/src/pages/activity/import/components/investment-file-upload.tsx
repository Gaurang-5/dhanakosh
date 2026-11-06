import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Label } from "@wealthfolio/ui";
import { FileDropzone } from "./file-dropzone";
import { readExcelImport, type ExcelImport } from "../utils/excel-import";
import { readIbkrTradeConfirmation } from "../utils/ibkr-pdf-import";
import { prepareInvestmentCsv } from "../utils/investment-csv";

interface InvestmentFileUploadProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
  isLoading: boolean;
  isValid: boolean;
  error: string | null;
  detectTransactionTable?: boolean;
}

export function InvestmentFileUpload(props: InvestmentFileUploadProps) {
  const { onFileChange } = props;
  const { t } = useTranslation("activity");
  const [source, setSource] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<ExcelImport | null>(null);
  const [sheet, setSheet] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const detectTransactionTable = props.detectTransactionTable ?? true;
  const previousDetection = useRef(detectTransactionTable);

  const reportError = useCallback(
    (cause: unknown) => {
      const key = cause instanceof Error ? cause.message : "";
      const keys = ["excelTooLarge", "excelInvalid", "excelEmpty"];
      setError(
        key.startsWith("ibkrPdf")
          ? t("import.upload.ibkrPdfInvalid")
          : t(`import.upload.${keys.includes(key) ? key : "excelInvalid"}`),
      );
    },
    [t],
  );
  const selectSheet = useCallback(
    (name: string, book = workbook) => {
      setSheet(name);
      setError(null);
      onFileChange(null);
      if (!name || !book) return;
      try {
        onFileChange(book.toCsvFile(name, detectTransactionTable));
      } catch (cause) {
        reportError(cause);
      }
    },
    [workbook, onFileChange, detectTransactionTable, reportError],
  );
  const selectFile = useCallback(
    async (file: File | null) => {
      const current = ++request.current;
      setError(null);
      setWorkbook(null);
      setSheet("");
      setSource(file);
      setBusy(false);
      if (file && /\.pdf$/i.test(file.name)) {
        onFileChange(null);
        setBusy(true);
        try {
          const converted = await readIbkrTradeConfirmation(file);
          if (request.current !== current) return;
          onFileChange(converted);
        } catch (cause) {
          if (request.current === current) reportError(cause);
        } finally {
          if (request.current === current) setBusy(false);
        }
        return;
      }
      if (file && /\.csv$/i.test(file.name) && detectTransactionTable) {
        onFileChange(null);
        setBusy(true);
        try {
          const prepared = await prepareInvestmentCsv(file);
          if (request.current === current) onFileChange(prepared);
        } catch {
          // Optional detection must not block the native CSV parser or manual mapping.
          if (request.current === current) onFileChange(file);
        } finally {
          if (request.current === current) setBusy(false);
        }
        return;
      }
      if (!file || !/\.xlsx?$/i.test(file.name)) {
        onFileChange(file);
        return;
      }
      onFileChange(null);
      setBusy(true);
      try {
        const book = await readExcelImport(file);
        if (request.current !== current) return;
        setWorkbook(book);
        if (book.sheetNames.length === 1) selectSheet(book.sheetNames[0], book);
      } catch (cause) {
        if (request.current === current) reportError(cause);
      } finally {
        if (request.current === current) setBusy(false);
      }
    },
    [onFileChange, detectTransactionTable, reportError, selectSheet],
  );
  useEffect(() => {
    if (previousDetection.current === detectTransactionTable) return;
    previousDetection.current = detectTransactionTable;
    // Recreate from the original source when a saved template or manual row
    // setting takes over, so its skip/header offsets are never applied twice.
    if (workbook && sheet) selectSheet(sheet);
    else if (source && /\.csv$/i.test(source.name)) void selectFile(source);
  }, [detectTransactionTable, selectFile, selectSheet, sheet, source, workbook]);
  return (
    <div className="space-y-3">
      <div className="h-29">
        <FileDropzone
          {...props}
          file={source ?? props.file}
          onFileChange={(file) => void selectFile(file)}
          accept=".csv,.xls,.xlsx,.pdf,application/pdf"
          isLoading={busy || props.isLoading}
          error={error ?? props.error}
        />
      </div>
      {workbook && (
        <div className="space-y-2">
          <Label htmlFor="import-excel-sheet">{t("import.upload.excelSheet")}</Label>
          <select
            id="import-excel-sheet"
            value={sheet}
            disabled={props.isLoading}
            onChange={(event) => selectSheet(event.target.value)}
            className="bg-background border-input w-full rounded-md border px-3 py-2 text-start"
          >
            <option value="">{t("import.upload.excelChooseSheet")}</option>
            {workbook.sheetNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-sm">{t("import.upload.excelHelp")}</p>
        </div>
      )}
    </div>
  );
}
