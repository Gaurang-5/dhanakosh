import type { HouseholdMemberHistory } from "./household-api";

export interface HouseholdHistoryTotal {
  date: string;
  currency: string;
  netWorth: string;
  totalAssets: string;
  totalLiabilities: string;
  portfolioValue: string;
  netContribution: string;
}

export function aggregateHouseholdHistory(
  histories: HouseholdMemberHistory[],
  selectedIds: ReadonlySet<string>,
): Record<string, HouseholdHistoryTotal[]> {
  if ([...selectedIds].some((id) => !histories.some((history) => history.memberId === id)))
    return {};
  const byCurrency = new Map<string, HouseholdMemberHistory[]>();
  for (const history of histories) {
    if (!selectedIds.has(history.memberId)) continue;
    byCurrency.set(history.currency, [...(byCurrency.get(history.currency) ?? []), history]);
  }
  const result: Record<string, HouseholdHistoryTotal[]> = {};
  for (const [currency, members] of byCurrency) {
    if (!members.length) continue;
    const days = members.map(
      (member) => new Map(member.points.map((point) => [point.date, point])),
    );
    result[currency] = members[0].points.flatMap((point) => {
      const sameDay = days.map((daily) => daily.get(point.date));
      if (sameDay.some((day) => !day)) return [];
      return [
        {
          date: point.date,
          currency,
          netWorth: String(sameDay.reduce((sum, day) => sum + Number(day?.netWorth ?? 0), 0)),
          portfolioValue: String(
            sameDay.reduce((sum, day) => sum + Number(day?.portfolioValue ?? 0), 0),
          ),
          netContribution: String(
            sameDay.reduce((sum, day) => sum + Number(day?.netContribution ?? 0), 0),
          ),
          totalAssets: String(sameDay.reduce((sum, day) => sum + Number(day?.totalAssets ?? 0), 0)),
          totalLiabilities: String(
            sameDay.reduce((sum, day) => sum + Number(day?.totalLiabilities ?? 0), 0),
          ),
        },
      ];
    });
  }
  return result;
}
