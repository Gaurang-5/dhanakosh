import type { ActivitySearchResponse } from "@/lib/types";

export async function searchHouseholdActivities(
  memberIds: string[],
  page: number,
  pageSize: number,
  filters: Record<string, unknown>,
  searchQuery: string,
  sort: { id: string; desc: boolean },
  includeCashBalances: boolean,
): Promise<ActivitySearchResponse> {
  const response = await fetch("/api/v1/profiles/household-activity-search", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      memberIds,
      page,
      pageSize,
      sort,
      includeCashBalances,
      accountIdFilter: filters.accountIds,
      activityTypeFilter: filters.activityTypes,
      instrumentTypeFilter: filters.instrumentTypes,
      activityIdFilter: filters.activityIds,
      needsReviewFilter: filters.needsReview,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      assetIdKeyword: searchQuery.trim() || undefined,
    }),
  });
  if (!response.ok) throw new Error("Unable to load household activities");
  const result = (await response.json()) as ActivitySearchResponse;
  return {
    ...result,
    data: result.data.map((row) => ({
      ...row,
      assetQuoteMode: (row as typeof row & { assetPricingMode?: string })
        .assetPricingMode as typeof row.assetQuoteMode,
    })),
  };
}
