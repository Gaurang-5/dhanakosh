import { describe, expect, it } from "vitest";
import type { InvestmentPlan } from "@/adapters/shared/investment-plans";
import type { ActivityDetails } from "@/lib/types";
import { installmentDate, purchaseCandidates } from "./schedule";
const plan: InvestmentPlan = {
  id: "test",
  name: "Fund",
  accountId: "owner-account",
  assetId: "fund",
  amount: "5000.00",
  currency: "INR",
  startDate: "2024-01-01",
  endDate: null,
  dayOfMonth: 31,
  paused: false,
};
describe("monthly investment instructions", () => {
  it("clamps month ends without drifting and respects active dates", () => {
    expect(installmentDate(plan, "2024-02")).toBe("2024-02-29");
    expect(installmentDate(plan, "2025-02")).toBe("2025-02-28");
    expect(installmentDate(plan, "2025-03")).toBe("2025-03-31");
    expect(installmentDate({ ...plan, paused: true }, "2025-03")).toBeNull();
    expect(installmentDate(plan, "2023-12")).toBeNull();
    expect(installmentDate({ ...plan, endDate: "2025-03-30" }, "2025-03")).toBeNull();
  });
  it("suggests same-owner purchases within fund rounding tolerance", () => {
    const activity = {
      activityType: "BUY",
      accountId: plan.accountId,
      assetId: plan.assetId,
      amount: "5000",
      currency: "INR",
      date: new Date("2025-03-04T00:00:00Z"),
    } as ActivityDetails;
    const others: Partial<ActivityDetails>[] = [
      { accountId: "another-owner" },
      { assetId: "other-fund" },
      { currency: "USD" },
      { amount: "5000.51" },
      { activityType: "SELL" },
      { date: new Date("2025-02-28T00:00:00Z") },
    ];
    expect(
      purchaseCandidates(plan, "2025-03", [
        activity,
        ...others.map((v) => ({ ...activity, ...v })),
      ]),
    ).toEqual([activity]);
    expect(purchaseCandidates({ ...plan, paused: true }, "2025-03", [activity])).toEqual([]);
    expect(purchaseCandidates(plan, "2025-03", [{ ...activity, amount: "4999.60" }])).toHaveLength(
      1,
    );
  });
  it("uses currency precision and the member timezone at month boundaries", () => {
    const activity = {
      activityType: "BUY",
      accountId: plan.accountId,
      assetId: plan.assetId,
      amount: "4999.999984",
      currency: "INR",
      date: new Date("2025-02-28T20:00:00Z"),
    } as ActivityDetails;
    expect(purchaseCandidates(plan, "2025-03", [activity], "Asia/Kolkata")).toEqual([activity]);
    expect(purchaseCandidates(plan, "2025-03", [activity], "UTC")).toEqual([]);
    expect(
      purchaseCandidates(plan, "2025-03", [{ ...activity, amount: "5000.51" }], "Asia/Kolkata"),
    ).toEqual([]);
  });
});
