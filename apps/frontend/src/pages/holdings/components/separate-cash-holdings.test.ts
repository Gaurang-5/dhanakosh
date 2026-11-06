import { describe, expect, it } from "vitest";
import type { Holding } from "@/lib/types";
import { HoldingType } from "@/lib/constants";
import { separateCashHoldings } from "./separate-cash-holdings";

const holding = (id: string, type: HoldingType, value: number) =>
  ({ id, holdingType: type, marketValue: { local: value, base: value }, weight: 9 }) as Holding;

describe("separate cash and investment positions", () => {
  it("keeps negative ledger cash out of investment allocations without deleting it", () => {
    const input = [
      holding("stock", HoldingType.SECURITY, 75),
      holding("fund", HoldingType.SECURITY, 25),
      holding("cash", HoldingType.CASH, -90),
    ];
    const result = separateCashHoldings(input);
    expect(result.investments.map((h) => h.weight)).toEqual([0.75, 0.25]);
    expect(result.cash).toEqual([input[2]]);
    expect(input[0].weight).toBe(9);
  });
  it("handles a cash-only account and zero investment values", () => {
    expect(separateCashHoldings([holding("cash", HoldingType.CASH, 100)]).investments).toEqual([]);
    expect(
      separateCashHoldings([holding("stock", HoldingType.SECURITY, 0)]).investments[0].weight,
    ).toBe(0);
  });
});
