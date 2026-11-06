import type { HouseholdMemberSummary } from "./household-api";

export interface AggregatedHouseholdTotal {
  assets: number;
  liabilities: number;
  netWorth: number;
}

export function aggregateHouseholdMembers(
  members: HouseholdMemberSummary[],
  selectedMemberIds: ReadonlySet<string>,
): Record<string, AggregatedHouseholdTotal> {
  return members.reduce<Record<string, AggregatedHouseholdTotal>>((totals, member) => {
    if (
      member.status !== "ready" ||
      !selectedMemberIds.has(member.id) ||
      !member.currency ||
      member.assets === null ||
      member.liabilities === null ||
      member.netWorth === null
    ) {
      return totals;
    }

    const current = totals[member.currency] ?? { assets: 0, liabilities: 0, netWorth: 0 };
    totals[member.currency] = {
      assets: current.assets + Number(member.assets),
      liabilities: current.liabilities + Number(member.liabilities),
      netWorth: current.netWorth + Number(member.netWorth),
    };
    return totals;
  }, {});
}
