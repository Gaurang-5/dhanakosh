import type { AccountScope } from "@/lib/types";
import { create } from "zustand";

export interface WorkspacePortfolioRef {
  id: string;
  name: string;
  accountIds: string[];
}

/** A portfolio is stored whole. Individual accounts are the ones outside those portfolios. */
export interface WorkspaceSelection {
  portfolioIds: string[];
  accountIds: string[];
}

export const EMPTY_WORKSPACE_SELECTION: WorkspaceSelection = {
  portfolioIds: [],
  accountIds: [],
};

export const useWorkspaceSelection = create<
  WorkspaceSelection & { setSelection: (selection: WorkspaceSelection) => void }
>((set) => ({
  ...EMPTY_WORKSPACE_SELECTION,
  setSelection: (selection) => set(selection),
}));

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const ids = new Set(left);
  return right.every((id) => ids.has(id));
}

export function selectedAccountIds(
  selection: WorkspaceSelection,
  portfolios: readonly WorkspacePortfolioRef[],
): string[] {
  const ids = new Set(selection.accountIds);
  for (const portfolio of portfolios) {
    if (!selection.portfolioIds.includes(portfolio.id)) continue;
    for (const accountId of portfolio.accountIds) ids.add(accountId);
  }
  return [...ids].sort();
}

export type PortfolioCheck = "all" | "some" | "none";

export function portfolioCheck(
  portfolio: WorkspacePortfolioRef,
  selection: WorkspaceSelection,
  portfolios: readonly WorkspacePortfolioRef[],
): PortfolioCheck {
  if (portfolio.accountIds.length === 0) {
    return selection.portfolioIds.includes(portfolio.id) ? "all" : "none";
  }
  const selected = new Set(selectedAccountIds(selection, portfolios));
  const count = portfolio.accountIds.filter((id) => selected.has(id)).length;
  if (count === 0) return "none";
  if (count === portfolio.accountIds.length) return "all";
  return "some";
}

function selectionFromAccounts(
  selected: Set<string>,
  emptyPortfolioIds: readonly string[],
  portfolios: readonly WorkspacePortfolioRef[],
): WorkspaceSelection {
  const portfolioIds: string[] = [];
  const covered = new Set<string>();
  for (const portfolio of portfolios) {
    if (portfolio.accountIds.length === 0) {
      if (emptyPortfolioIds.includes(portfolio.id)) portfolioIds.push(portfolio.id);
      continue;
    }
    if (portfolio.accountIds.every((id) => selected.has(id))) {
      portfolioIds.push(portfolio.id);
      for (const id of portfolio.accountIds) covered.add(id);
    }
  }
  return {
    portfolioIds: portfolioIds.sort(),
    accountIds: [...selected].filter((id) => !covered.has(id)).sort(),
  };
}

export function togglePortfolio(
  selection: WorkspaceSelection,
  portfolio: WorkspacePortfolioRef,
  portfolios: readonly WorkspacePortfolioRef[],
): WorkspaceSelection {
  if (portfolio.accountIds.length === 0) {
    const on = selection.portfolioIds.includes(portfolio.id);
    return selectionFromAccounts(
      new Set(selectedAccountIds(selection, portfolios)),
      on
        ? selection.portfolioIds.filter((id) => id !== portfolio.id)
        : [...selection.portfolioIds, portfolio.id],
      portfolios,
    );
  }

  const selected = new Set(selectedAccountIds(selection, portfolios));
  const allOn = portfolio.accountIds.every((id) => selected.has(id));
  for (const id of portfolio.accountIds) {
    if (allOn) selected.delete(id);
    else selected.add(id);
  }
  return selectionFromAccounts(selected, selection.portfolioIds, portfolios);
}

export function toggleAccount(
  selection: WorkspaceSelection,
  accountId: string,
  portfolios: readonly WorkspacePortfolioRef[],
): WorkspaceSelection {
  const selected = new Set(selectedAccountIds(selection, portfolios));
  if (selected.has(accountId)) selected.delete(accountId);
  else selected.add(accountId);
  return selectionFromAccounts(selected, selection.portfolioIds, portfolios);
}

export interface WorkspaceScopeView {
  scope: AccountScope;
  /** Nothing is narrowed, or every account is selected. */
  isAll: boolean;
  portfolioNames: string[];
  accountCount: number;
}

export function workspaceScopeView(
  selection: WorkspaceSelection,
  portfolios: readonly WorkspacePortfolioRef[],
  everyAccountId: readonly string[],
): WorkspaceScopeView {
  const ids = selectedAccountIds(selection, portfolios);
  const explicit = selection.portfolioIds.length > 0 || selection.accountIds.length > 0;
  const coversAll = ids.length > 0 && sameIds(ids, everyAccountId);
  if (!explicit || coversAll) {
    return { scope: { type: "all" }, isAll: true, portfolioNames: [], accountCount: 0 };
  }

  if (ids.length === 0) {
    const names = portfolios
      .filter((portfolio) => selection.portfolioIds.includes(portfolio.id))
      .map((portfolio) => portfolio.name);
    return {
      scope: { type: "accounts", accountIds: [] },
      isAll: false,
      portfolioNames: names,
      accountCount: 0,
    };
  }

  const selected = new Set(ids);
  const full = portfolios.filter(
    (portfolio) =>
      portfolio.accountIds.length > 0 && portfolio.accountIds.every((id) => selected.has(id)),
  );
  const partial = portfolios.some((portfolio) => {
    const count = portfolio.accountIds.filter((id) => selected.has(id)).length;
    return count > 0 && count < portfolio.accountIds.length;
  });
  const covered = new Set(full.flatMap((portfolio) => portfolio.accountIds));
  const outside = ids.some((id) => !covered.has(id));
  const sole = portfolios.filter(
    (portfolio) => portfolio.accountIds.length > 0 && sameIds(portfolio.accountIds, ids),
  );

  let scope: AccountScope;
  if (sole.length === 1) scope = { type: "portfolio", portfolioId: sole[0].id };
  else scope = { type: "accounts", accountIds: ids };

  if (!partial && !outside && full.length > 0) {
    return {
      scope,
      isAll: false,
      portfolioNames: full.map((portfolio) => portfolio.name),
      accountCount: ids.length,
    };
  }

  return {
    scope,
    isAll: false,
    portfolioNames: [],
    accountCount: ids.length,
  };
}
