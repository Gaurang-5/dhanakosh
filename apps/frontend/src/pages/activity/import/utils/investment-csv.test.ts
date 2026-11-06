import { describe, expect, it, vi } from "vitest";
import { prepareInvestmentCsv } from "./investment-csv";

describe("local transaction CSV preparation", () => {
  it.each([",", ";", "\t"])(
    "finds a transaction table with delimiter %j without coercing cells",
    async (delimiter) => {
      const lines = [
        ["Broker report"],
        ["Trade Date", "Action", "Ticker", "Shares", "Execution Price", "Currency", "Comment"],
        [
          "2026-01-02",
          "BUY",
          "000001",
          "0.123456789012",
          "100.123456789",
          "USD",
          '"quoted, comment"',
        ],
      ];
      const file = new File([lines.map((row) => row.join(delimiter)).join("\r\n")], "report.csv");
      const prepared = await prepareInvestmentCsv(file);
      expect(prepared).not.toBe(file);
      expect(prepared.name).toBe("report.csv");
      const text = await prepared.text();
      expect(text).not.toContain("Broker report");
      expect(text).toContain("000001,0.123456789012,100.123456789,USD");
      expect(text).toContain('"quoted, comment"');
    },
  );

  it("does not contact any provider while preparing a file", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network"));
    try {
      await prepareInvestmentCsv(
        new File(
          ["Report\nDate,Action,Symbol,Quantity,Price\n2026-01-01,BUY,DEMO,1,2"],
          "report.csv",
        ),
      );
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });

  it("preserves unknown formats and header-first files byte-for-byte", async () => {
    for (const content of [
      "custom;format\n01;02",
      "Date,Action,Symbol,Quantity,Price\n2026-01-01,BUY,DEMO,1,2",
    ]) {
      const file = new File([content], "report.csv");
      expect(await prepareInvestmentCsv(file)).toBe(file);
    }
  });

  it("leaves legacy encodings to the existing native CSV decoder", async () => {
    const file = new File([new Uint8Array([0xff, 0xfe, 0x41, 0x00])], "report.csv");
    expect(await prepareInvestmentCsv(file)).toBe(file);
  });

  it("does not fold trades together when a quoted field is unterminated", async () => {
    const file = new File(
      [
        'Report\nDate,Action,Symbol,Quantity,Price\n2026-01-02,BUY,"DEMO,1,2\n2026-01-03,SELL,OTHER,1,2',
      ],
      "malformed.csv",
    );
    expect(await prepareInvestmentCsv(file)).toBe(file);
  });

  it("does not hide populated columns outside the detected table", async () => {
    const file = new File(
      ["Report\nDate,Action,Symbol,Quantity,Price\n2026-01-02,BUY,DEMO,1,2,UNLABELLED"],
      "extra.csv",
    );
    expect(await prepareInvestmentCsv(file)).toBe(file);
  });
});
