import type { IncomeSummary } from "@/lib/types";
import { householdRecordId } from "./household-overview-data";

export interface MemberIncome {
  memberId: string;
  memberName: string;
  firstActivity: string | null;
  today: string;
  income: IncomeSummary[];
}

/** Rebuild ratios after summing amounts; keep native currency and FX warnings. */
export function combineIncome(reports: MemberIncome[], currency: string): IncomeSummary[] {
  const summaries = new Map<string, IncomeSummary>();
  const first = reports.flatMap((r) => (r.firstActivity ? [r.firstActivity] : [])).sort()[0];
  const today = reports.map((r) => r.today).sort()[0];
  for (const report of reports) {
    for (const row of report.income) {
      if (row.currency !== currency)
        throw new Error("Members must use the same reporting currency");
      let total = summaries.get(row.period);
      if (!total) {
        total = {
          ...row,
          byMonth: {},
          byType: {},
          byAsset: {},
          byCurrency: {},
          byCurrencyBase: {},
          byAccount: {},
          totalIncome: 0,
          monthlyAverage: 0,
          yoyGrowth: null,
          unconvertedCurrencies: [],
        };
        summaries.set(row.period, total);
      }
      total.totalIncome += row.totalIncome;
      for (const field of ["byMonth", "byType", "byCurrency", "byCurrencyBase"] as const) {
        for (const [key, amount] of Object.entries(row[field])) {
          total[field][key] = (total[field][key] ?? 0) + amount;
        }
      }
      for (const [id, asset] of Object.entries(row.byAsset)) {
        const scopedId = householdRecordId(report.memberId, id);
        total.byAsset[scopedId] = {
          ...asset,
          assetId: scopedId,
          name: `${report.memberName} · ${asset.name}`,
        };
      }
      for (const [id, account] of Object.entries(row.byAccount)) {
        const scopedId = householdRecordId(report.memberId, id);
        total.byAccount[scopedId] = {
          ...account,
          accountId: scopedId,
          accountName: `${report.memberName} · ${account.accountName}`,
        };
      }
      total.unconvertedCurrencies = [
        ...new Set([...total.unconvertedCurrencies, ...row.unconvertedCurrencies]),
      ];
    }
  }
  if (!first || !today) return [...summaries.values()];
  const [year, month] = today.split("-").map(Number);
  const [firstYear, firstMonth] = first.split("-").map(Number);
  for (const row of summaries.values()) {
    const periodYear = row.period === "LAST_YEAR" ? year - 1 : year - 2;
    const months =
      row.period === "ALL"
        ? Math.max(1, (year - firstYear) * 12 + month - firstMonth)
        : row.period === "YTD"
          ? month
          : firstYear > periodYear
            ? 0
            : firstYear === periodYear
              ? 13 - firstMonth
              : 12;
    row.monthlyAverage = months > 0 ? row.totalIncome / months : 0;
    const previous = summaries.get(row.period === "YTD" ? "LAST_YEAR" : "TWO_YEARS_AGO");
    if (["YTD", "LAST_YEAR"].includes(row.period) && previous && previous.totalIncome > 0) {
      row.yoyGrowth = (row.totalIncome - previous.totalIncome) / previous.totalIncome;
    }
  }
  return [...summaries.values()];
}

export async function getHouseholdIncome(
  ids: string[],
  currency: string,
): Promise<IncomeSummary[]> {
  const params = new URLSearchParams({ memberIds: ids.join(","), currency });
  const response = await fetch(`/api/v1/profiles/household-income?${params}`, {
    credentials: "same-origin",
  });
  if (!response.ok)
    throw new Error(
      response.status === 400
        ? "Combined income requires members with the same reporting currency."
        : "Household income is unavailable",
    );
  return combineIncome((await response.json()) as MemberIncome[], currency);
}
