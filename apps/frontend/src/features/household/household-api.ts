import type { Goal } from "@/lib/types";
import { householdRecordId } from "./household-overview-data";

export async function getSelectedHouseholdGoals(ids: string[]): Promise<Goal[]> {
  return (await getHouseholdGoals())
    .filter((row) => ids.includes(row.memberId))
    .map((row) => ({
      ...row.goal,
      id: householdRecordId(row.memberId, row.goal.id),
      title: `${row.memberName} · ${row.goal.title}`,
    }));
}

export interface HouseholdMemberSummary {
  id: string;
  name: string;
  avatarId: string;
  status: "ready" | "unavailable";
  currency: string | null;
  assets: string | null;
  liabilities: string | null;
  netWorth: string | null;
  accountsAvailable: boolean;
  accounts: HouseholdAccountSummary[];
  holdingsAvailable: boolean;
  holdings: HouseholdHoldingSummary[];
}

export interface HouseholdHoldingSummary {
  id: string;
  assetId: string | null;
  accountId: string;
  accountName: string;
  symbol: string | null;
  name: string;
  currency: string;
  quantity: string;
  marketValue: string;
  marketValueBase: string;
  costBasisBase: string | null;
  unrealizedGainBase: string | null;
  incomeBase: string | null;
  instrumentType: string | null;
  exchangeMic: string | null;
}

export interface HouseholdAccountSummary {
  id: string;
  name: string;
  accountType: string;
  group: string | null;
  currency: string;
  isActive: boolean;
  isArchived: boolean;
}

export interface HouseholdCurrencyTotal {
  assets: string;
  liabilities: string;
  netWorth: string;
}

export interface HouseholdSummary {
  date: string;
  members: HouseholdMemberSummary[];
  totalsByCurrency: Record<string, HouseholdCurrencyTotal>;
}

export interface HouseholdMemberHistory {
  memberId: string;
  currency: string;
  points: {
    date: string;
    netWorth: string;
    totalAssets: string;
    totalLiabilities: string;
    portfolioValue: string;
    netContribution: string;
    alternativeAssetsValue?: string;
    breakdown?: Record<string, string>;
  }[];
}

export function localHouseholdDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export async function getHouseholdSummary(
  date: string,
  includeHoldings = false,
): Promise<HouseholdSummary> {
  const response = await fetch(
    `/api/v1/profiles/household-summary?date=${encodeURIComponent(date)}&includeHoldings=${includeHoldings}`,
    { credentials: "same-origin" },
  );
  if (!response.ok) throw new Error(`Household summary failed (${response.status})`);
  return response.json() as Promise<HouseholdSummary>;
}

export async function getHouseholdHistory(
  startDate: string,
  endDate: string,
): Promise<HouseholdMemberHistory[]> {
  const query = new URLSearchParams({ startDate, endDate });
  const response = await fetch(`/api/v1/profiles/household-history?${query}`, {
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error(`Household history failed (${response.status})`);
  return response.json() as Promise<HouseholdMemberHistory[]>;
}

export interface HouseholdActivity {
  id: string;
  memberId: string;
  memberName: string;
  accountName: string;
  assetName: string | null;
  symbol: string;
  activityType: string;
  date: string;
  quantity: string | null;
  amount: string | null;
  currency: string;
}

export interface HouseholdGoal {
  memberId: string;
  memberName: string;
  goal: Goal;
}

export async function getHouseholdActivities(memberIds: string[], page: number) {
  const query = new URLSearchParams({
    memberIds: memberIds.join(","),
    page: String(page),
    pageSize: "30",
  });
  const response = await fetch(`/api/v1/profiles/household-activities?${query}`, {
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error(`Household activities failed (${response.status})`);
  return response.json() as Promise<{ data: HouseholdActivity[]; total: number }>;
}

export async function getHouseholdGoals() {
  const response = await fetch("/api/v1/profiles/household-goals", { credentials: "same-origin" });
  if (!response.ok) throw new Error(`Household goals failed (${response.status})`);
  return response.json() as Promise<HouseholdGoal[]>;
}

export interface HouseholdInvestmentPlans {
  memberId: string;
  memberName: string;
  plans: import("@/adapters/shared/investment-plans").InvestmentPlan[];
}
export async function getHouseholdInvestmentPlans(): Promise<HouseholdInvestmentPlans[]> {
  const response = await fetch("/api/v1/profiles/household-investment-plans", {
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error(`Household investment plans failed (${response.status})`);
  return response.json() as Promise<HouseholdInvestmentPlans[]>;
}

export async function getHouseholdExposure(
  memberIds: string[],
  currency: string,
): Promise<import("@/adapters/shared/fund-exposure").MemberExposure[]> {
  const params = new URLSearchParams({ memberIds: memberIds.join(","), currency });
  const response = await fetch(`/api/v1/profiles/household-exposure?${params}`, {
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("Household exposure is unavailable");
  return response.json() as Promise<import("@/adapters/shared/fund-exposure").MemberExposure[]>;
}
