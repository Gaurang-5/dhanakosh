import { describe, expect, it } from "vitest";
import { isPpfAccount, ppfAccountMeta } from "./ppf-account";

describe("PPF account preset", () => {
  it("preserves other account settings and classifies the ledger as fixed income", () => {
    const meta = ppfAccountMeta(
      JSON.stringify({ broker: { name: "Bank" }, allocation: { custom: true } }),
    );
    expect(JSON.parse(meta)).toEqual({
      broker: { name: "Bank" },
      investmentProduct: "PPF",
      allocation: { custom: true, cashCategoryId: "FIXED_INCOME" },
    });
    const account = {
      meta,
      accountType: "SECURITIES",
      currency: "INR",
      trackingMode: "TRANSACTIONS",
    };
    expect(isPpfAccount(account)).toBe(true);
    expect(isPpfAccount({ ...account, currency: "USD" })).toBe(false);
    expect(isPpfAccount({ ...account, trackingMode: "HOLDINGS" })).toBe(false);
    expect(isPpfAccount({ ...account, accountType: "CASH" })).toBe(false);
  });
  it("does not infer PPF from an ordinary account or malformed metadata", () => {
    expect(isPpfAccount()).toBe(false);
    for (const meta of ["null", "[]", "broken", "{}", undefined]) {
      expect(
        isPpfAccount({
          meta,
          accountType: "SECURITIES",
          currency: "INR",
          trackingMode: "TRANSACTIONS",
        }),
      ).toBe(false);
      expect(JSON.parse(ppfAccountMeta(meta))).toMatchObject({ investmentProduct: "PPF" });
    }
  });
});
