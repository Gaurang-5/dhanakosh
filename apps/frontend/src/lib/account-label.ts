import type { PortfolioWithAccounts } from "@/lib/types";

/** Display ownership without changing the account name used by CSV matching. */
export function accountLabel(
  account: { id: string; name: string },
  portfolios: Pick<PortfolioWithAccounts, "name" | "accountIds">[],
): string {
  const portfolio = portfolios.find((p) => p.accountIds.includes(account.id));
  return portfolio ? `${portfolio.name} / ${account.name}` : account.name;
}
