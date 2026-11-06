import { afterEach, expect, it, vi } from "vitest";
import { getHouseholdAllocation } from "./household-allocation";

afterEach(() => vi.unstubAllGlobals());

it("recalculates category weights over the whole selected family and keeps ownership", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () =>
        [100, 300].map((value, index) => ({
          memberId: `member-${index}`,
          allocation: {
            taxonomyId: "asset_classes",
            taxonomyName: "Classes",
            categoryId: "EQUITY",
            categoryName: "Equity",
            color: "",
            currency: "INR",
            totalValue: value,
            holdings: [
              {
                id: "shared-id",
                symbol: "TEST",
                holdingType: "security",
                quantity: 1,
                currency: "INR",
                marketValue: value,
                weightInCategory: 100,
              },
            ],
          },
        })),
    }),
  );
  const result = await getHouseholdAllocation(
    ["member-0", "member-1"],
    "INR",
    "asset_classes",
    "EQUITY",
  );
  expect(result.totalValue).toBe(400);
  expect(result.holdings.map((h) => h.weightInCategory)).toEqual([75, 25]);
  expect(result.holdings.map((h) => h.id)).toEqual(["member-1::shared-id", "member-0::shared-id"]);
});
