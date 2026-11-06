import { describe, expect, it } from "vitest";
import type { DraftActivity } from "../context/import-context";
import { applyImportSkipUpdates } from "./import-skip-updates";
import { draftToActivityImport } from "./draft-utils";

const draft = {
  rowIndex: 0,
  status: "skipped",
  errors: {},
  warnings: {},
  accountId: "manoj-zerodha",
  activityType: "BUY",
  activityDate: "2026-01-01",
  symbol: "TEST",
  quantity: "1",
  unitPrice: "10",
  currency: "INR",
} as DraftActivity;
const unskip = { status: "valid", forceImport: false, skipReason: undefined } as const;

describe("explicit unskip", () => {
  it.each([
    { duplicateOfId: "existing" },
    { duplicateOfLineNumber: 0 },
    { warnings: { _duplicate: ["Same economic values"] } },
  ])("forces a known duplicate through submission: %j", (duplicate) => {
    const restored = applyImportSkipUpdates({ ...draft, ...duplicate }, unskip);
    expect(restored.status).toBe("duplicate");
    expect(draftToActivityImport(restored)).toMatchObject({
      forceImport: true,
      isValid: true,
      accountId: "manoj-zerodha",
    });
  });
  it("does not bypass errors or force ordinary rows", () => {
    expect(applyImportSkipUpdates(draft, unskip).forceImport).toBe(false);
    const invalid = applyImportSkipUpdates(
      { ...draft, duplicateOfId: "existing", errors: { quantity: ["Required"] } },
      unskip,
    );
    expect(invalid).toMatchObject({ status: "error", forceImport: false });
  });
});
