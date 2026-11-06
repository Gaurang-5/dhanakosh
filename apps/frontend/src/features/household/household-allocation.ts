import type { AllocationHoldings } from "@/lib/types";
import { householdRecordId } from "./household-overview-data";

export async function getHouseholdAllocation(
  ids: string[],
  currency: string,
  taxonomyId: string,
  categoryId: string,
): Promise<AllocationHoldings> {
  const [ownerId, customId] = taxonomyId.includes("::") ? taxonomyId.split("::") : [];
  const params = new URLSearchParams({
    memberIds: (ownerId ? ids.filter((id) => id === ownerId) : ids).join(","),
    currency,
    taxonomyId: customId ?? taxonomyId,
    categoryId,
  });
  const response = await fetch(`/api/v1/profiles/household-overview?${params}`, {
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("Household allocation unavailable");
  const rows = (await response.json()) as { memberId: string; allocation: AllocationHoldings }[];
  if (!rows.length) throw new Error("No selected members");
  const totalValue = rows.reduce((sum, row) => sum + row.allocation.totalValue, 0);
  return {
    ...rows[0].allocation,
    taxonomyId,
    totalValue,
    holdings: rows
      .flatMap((row) =>
        row.allocation.holdings.map((holding) => ({
          ...holding,
          id: householdRecordId(row.memberId, holding.id),
          weightInCategory: totalValue > 0 ? (holding.marketValue / totalValue) * 100 : 0,
        })),
      )
      .sort((a, b) => b.marketValue - a.marketValue),
  };
}
