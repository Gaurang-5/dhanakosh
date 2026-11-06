import { describe, expect, it } from "vitest";
import { aggregateHouseholdHistory } from "./household-history";
import type { HouseholdMemberHistory } from "./household-api";

const history = (
  memberId: string,
  currency = "INR",
  date = "2026-10-24",
): HouseholdMemberHistory => ({
  memberId,
  currency,
  points: [
    {
      date,
      netWorth: "90",
      totalAssets: "100",
      totalLiabilities: "10",
      portfolioValue: "80",
      netContribution: "60",
    },
  ],
});

describe("combined family history", () => {
  it("sums only selected members with the same base currency", () => {
    const result = aggregateHouseholdHistory(
      [history("a"), history("b"), history("c")],
      new Set(["a", "b"]),
    );
    expect(result.INR[0]).toMatchObject({
      netWorth: "180",
      totalAssets: "200",
      portfolioValue: "160",
      netContribution: "120",
    });
  });
  it("keeps different currencies separate", () => {
    const result = aggregateHouseholdHistory(
      [history("a"), history("b", "USD")],
      new Set(["a", "b"]),
    );
    expect(result.INR[0].netWorth).toBe("90");
    expect(result.USD[0].netWorth).toBe("90");
  });
  it("does not present incomplete member history as a complete family total", () => {
    expect(aggregateHouseholdHistory([history("a")], new Set(["a", "b"]))).toEqual({});
    expect(
      aggregateHouseholdHistory(
        [history("a"), history("b", "INR", "2026-10-23")],
        new Set(["a", "b"]),
      ),
    ).toEqual({ INR: [] });
  });
});
