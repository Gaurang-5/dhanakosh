import { useAccounts } from "@/hooks/use-accounts";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { useAccountScopeStore } from "@/lib/account-scope-store";
import { Button, Checkbox, Icons } from "@wealthfolio/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@wealthfolio/ui/components/ui/popover";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRetainWorkspaceFilterHost } from "./workspace-filter-host";
import {
  EMPTY_WORKSPACE_SELECTION,
  portfolioCheck,
  selectedAccountIds,
  toggleAccount,
  togglePortfolio,
  useWorkspaceSelection,
  workspaceScopeView,
  type WorkspacePortfolioRef,
} from "./workspace-selection";

export function WorkspaceFilterHost() {
  useRetainWorkspaceFilterHost();
  return <WorkspaceFilter />;
}

function scopeKey(scope: ReturnType<typeof workspaceScopeView>["scope"]): string {
  if (scope.type === "all") return "all";
  if (scope.type === "portfolio") return `portfolio:${scope.portfolioId}`;
  if (scope.type === "account") return `account:${scope.accountId}`;
  return `accounts:${scope.accountIds.join(",")}`;
}

export function WorkspaceFilter() {
  const { t } = useTranslation("settings");
  const { accounts } = useAccounts({ filterActive: false });
  const { data: portfolios = [] } = usePortfolios();
  const selection = useWorkspaceSelection();
  const currentScope = useAccountScopeStore((state) => state.scope);
  const setScope = useAccountScopeStore((state) => state.setScope);
  const [open, setOpen] = useState(false);
  const mobile = useIsMobileViewport();

  const accountName = useMemo(() => {
    const names = new Map<string, string>();
    for (const account of accounts) names.set(account.id, account.name);
    return names;
  }, [accounts]);

  const groups = useMemo<WorkspacePortfolioRef[]>(
    () =>
      portfolios.map((portfolio) => ({
        id: portfolio.id,
        name: portfolio.name,
        accountIds: portfolio.accountIds.filter((id) => accountName.has(id)),
      })),
    [portfolios, accountName],
  );

  const groupedIds = useMemo(
    () => new Set(groups.flatMap((portfolio) => portfolio.accountIds)),
    [groups],
  );
  const ungrouped = useMemo(
    () => accounts.filter((account) => !groupedIds.has(account.id)),
    [accounts, groupedIds],
  );
  const everyAccountId = useMemo(() => accounts.map((account) => account.id), [accounts]);
  const view = useMemo(
    () => workspaceScopeView(selection, groups, everyAccountId),
    [selection, groups, everyAccountId],
  );
  const chosen = new Set(selectedAccountIds(selection, groups));
  const label = view.isAll
    ? t("workspace.allPortfolios")
    : view.portfolioNames.length > 0
      ? view.portfolioNames.join(" + ")
      : t("workspace.selectedAccounts", { count: view.accountCount });

  const key = scopeKey(view.scope);
  const currentKey = scopeKey(currentScope);
  const scopeToApply = useRef(view.scope);
  scopeToApply.current = view.scope;
  // Depend on the string key, not the scope object. Account and portfolio
  // queries hand out a new array while they load, so the object is new every
  // render and publishing it would update the store forever.
  useEffect(() => {
    if (currentKey === key) return;
    setScope(scopeToApply.current);
  }, [currentKey, key, setScope]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="min-w-0 max-w-full shrink gap-1 md:max-w-48"
          />
        }
      >
        <span className="min-w-0 truncate">{label}</span>
        <Icons.ChevronDown className="size-4 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align={mobile ? "start" : "end"} collisionPadding={8} className="w-80 p-2">
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {groups.map((portfolio) => {
            const check = portfolioCheck(portfolio, selection, groups);
            return (
              <div
                key={portfolio.id}
                className="border-border border-t pt-1 first:border-t-0 first:pt-0"
              >
                <label className="flex items-center gap-2 px-1 py-1.5 font-medium">
                  <Checkbox
                    checked={check !== "none"}
                    indeterminate={check === "some"}
                    onCheckedChange={() =>
                      selection.setSelection(togglePortfolio(selection, portfolio, groups))
                    }
                  />
                  {portfolio.name}
                </label>
                {portfolio.accountIds.map((accountId) => (
                  <label key={accountId} className="flex items-center gap-2 py-1.5 pe-1 ps-7">
                    <Checkbox
                      checked={chosen.has(accountId)}
                      onCheckedChange={() =>
                        selection.setSelection(toggleAccount(selection, accountId, groups))
                      }
                    />
                    {accountName.get(accountId)}
                  </label>
                ))}
              </div>
            );
          })}
          {ungrouped.length > 0 && (
            <div className="border-border border-t pt-1">
              <p className="text-muted-foreground px-1 py-1 text-xs">
                {t("workspace.otherAccounts")}
              </p>
              {ungrouped.map((account) => (
                <label key={account.id} className="flex items-center gap-2 px-1 py-1.5">
                  <Checkbox
                    checked={chosen.has(account.id)}
                    onCheckedChange={() =>
                      selection.setSelection(toggleAccount(selection, account.id, groups))
                    }
                  />
                  {account.name}
                </label>
              ))}
            </div>
          )}
        </div>
        {!view.isAll && (
          <Button
            size="sm"
            variant="ghost"
            className="mt-1"
            onClick={() => selection.setSelection(EMPTY_WORKSPACE_SELECTION)}
          >
            {t("workspace.reset")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
