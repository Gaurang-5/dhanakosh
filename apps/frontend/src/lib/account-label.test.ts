import { describe, expect, it } from "vitest";
import { accountLabel } from "./account-label";

describe("account ownership labels", () => {
  it("distinguishes identical broker names without altering account identity", () => {
    const portfolios = [
      { name: "Gaurang", accountIds: ["a"] },
      { name: "Retirement", accountIds: ["b"] },
    ];
    expect(accountLabel({ id: "a", name: "Zerodha" }, portfolios)).toBe("Gaurang / Zerodha");
    expect(accountLabel({ id: "b", name: "Zerodha" }, portfolios)).toBe("Retirement / Zerodha");
  });
});
