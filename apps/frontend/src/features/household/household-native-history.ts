import type { NetWorthHistoryPoint } from "@/lib/types";
import { getHouseholdHistory } from "./household-api";
import { aggregateHouseholdHistory } from "./household-history";
import { householdRecordId } from "./household-overview-data";

export async function getCombinedNetWorthHistory(
  ids: string[],
  currency: string,
  categories: string[],
  start: string,
  end: string,
): Promise<NetWorthHistoryPoint[]> {
  const histories = (await getHouseholdHistory(start, end)).filter((h) => ids.includes(h.memberId));
  if (histories.some((h) => h.currency !== currency))
    throw new Error("History requires a common reporting currency");
  const totals = aggregateHouseholdHistory(histories, new Set(ids))[currency] ?? [];
  const indexed = histories.map((member) => ({
    memberId: member.memberId,
    points: new Map(member.points.map((point) => [point.date, point])),
  }));
  return totals.map((total) => {
    const breakdown: Record<string, string> = {};
    let alternativeAssetsValue = 0;
    for (const member of indexed) {
      const point = member.points.get(total.date)!;
      alternativeAssetsValue += Number(point.alternativeAssetsValue ?? 0);
      for (const [key, value] of Object.entries(point.breakdown ?? {})) {
        const id = categories.includes(key) ? key : householdRecordId(member.memberId, key);
        breakdown[id] = String(Number(breakdown[id] ?? 0) + Number(value));
      }
    }
    return { ...total, alternativeAssetsValue: String(alternativeAssetsValue), breakdown };
  });
}
