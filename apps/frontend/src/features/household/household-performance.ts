import type { AccountScope, PerformanceResult } from "@/lib/types";

export async function getHouseholdPerformance(
  memberIds: string[],
  currency: string,
  startDate?: string,
  endDate?: string,
  filter?: AccountScope,
): Promise<PerformanceResult> {
  if (filter?.type === "portfolio")
    throw new Error("Select family members or investment accounts for combined performance");
  const accountIds =
    filter?.type === "account"
      ? [filter.accountId]
      : filter?.type === "accounts"
        ? filter.accountIds
        : undefined;
  const response = await fetch("/api/v1/profiles/household-performance", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memberIds, currency, startDate, endDate, accountIds }),
  });
  if (!response.ok)
    throw new Error(
      response.status === 400
        ? "Select members with the same reporting currency and a valid date range."
        : "Household performance is unavailable",
    );
  return (await response.json()) as PerformanceResult;
}
