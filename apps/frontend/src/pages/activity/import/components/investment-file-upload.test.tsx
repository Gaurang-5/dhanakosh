import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { utils, write } from "xlsx";
import { InvestmentFileUpload } from "./investment-file-upload";

afterEach(cleanup);

it("restores the original CSV when manual settings or a saved template take over", async () => {
  const file = new File(
    ["Report\nDate,Action,Symbol,Quantity,Price\n2026-01-02,BUY,DEMO,1,2"],
    "activity.csv",
  );
  const onFileChange = vi.fn();
  const props = { file: null, onFileChange, isLoading: false, isValid: true, error: null };
  const { container, rerender } = render(
    <InvestmentFileUpload {...props} detectTransactionTable />,
  );
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
  await waitFor(() => expect(onFileChange).toHaveBeenLastCalledWith(expect.any(File)));
  expect(await (onFileChange.mock.calls.at(-1)![0] as File).text()).toMatch(/^Date/);
  rerender(<InvestmentFileUpload {...props} detectTransactionTable={false} />);
  await waitFor(() => expect(onFileChange).toHaveBeenLastCalledWith(file));
});

it("prepares a CSV report locally before handing it to the existing parser", async () => {
  const file = new File(
    [
      "Statement\nTrade Date,Action,Ticker,Shares,Execution Price,Currency\n2026-01-02,BUY,AAPL,0.123456789,200,USD",
    ],
    "activity.csv",
  );
  const onFileChange = vi.fn();
  const { container } = render(
    <InvestmentFileUpload
      file={null}
      onFileChange={onFileChange}
      isLoading={false}
      isValid
      error={null}
    />,
  );
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
  await waitFor(() => expect(onFileChange).toHaveBeenLastCalledWith(expect.any(File)));
  expect(await (onFileChange.mock.calls.at(-1)![0] as File).text()).toMatch(/^Trade Date/);
});

it("offers Excel and requires sheet selection before handing data to the importer", async () => {
  const book = utils.book_new();
  utils.book_append_sheet(book, utils.aoa_to_sheet([["symbol"], ["FIRST"]]), "First");
  utils.book_append_sheet(book, utils.aoa_to_sheet([["symbol"], ["SECOND"]]), "Second");
  const file = new File(
    [write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer],
    "history.xlsx",
  );
  const onFileChange = vi.fn();
  const { container } = render(
    <div dir="rtl">
      <InvestmentFileUpload
        file={null}
        onFileChange={onFileChange}
        isLoading={false}
        isValid
        error={null}
      />
    </div>,
  );
  const input = container.querySelector('input[type="file"]')!;
  expect(input.getAttribute("accept")).toBe(".csv,.xls,.xlsx,.pdf,application/pdf");
  fireEvent.change(input, { target: { files: [file] } });
  const select = await screen.findByLabelText("Excel worksheet");
  expect(onFileChange.mock.calls.every(([value]) => value === null)).toBe(true);
  fireEvent.change(select, { target: { value: "Second" } });
  await waitFor(() => expect(onFileChange).toHaveBeenLastCalledWith(expect.any(File)));
  const selected = onFileChange.mock.calls.at(-1)![0] as File;
  expect(await selected.text()).toBe("symbol\nSECOND");
  fireEvent.change(select, { target: { value: "" } });
  expect(onFileChange).toHaveBeenLastCalledWith(null);
});
