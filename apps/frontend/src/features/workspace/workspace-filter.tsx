import { useAccounts } from "@/hooks/use-accounts";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { useAccountScopeStore } from "@/lib/account-scope-store";
import { cn } from "@/lib/utils";
import { Button, Icons } from "@wealthfolio/ui";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@wealthfolio/ui/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@wealthfolio/ui/components/ui/sheet";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

function ScopeChoice({
  label,
  icon,
  checked,
  partial = false,
  nested = false,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  checked: boolean;
  partial?: boolean;
  nested?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={partial ? "mixed" : checked}
      onClick={onClick}
      className={cn(
        "hover:bg-muted/60 flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-start text-sm",
        nested ? "ps-7" : "font-medium",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {checked ? <Icons.Check className="text-primary size-4 shrink-0" /> : null}
      {partial && !checked ? <span className="bg-primary size-1.5 shrink-0 rounded-full" /> : null}
    </button>
  );
}

export function WorkspaceFilterHost({ hidden = false }: { hidden?: boolean }) {
  useRetainWorkspaceFilterHost();
  if (hidden) return null;
  return <WorkspaceFilter />;
}

function scopeKey(scope: ReturnType<typeof workspaceScopeView>["scope"]): string {
  if (scope.type === "all") return "all";
  if (scope.type === "portfolio") return `portfolio:${scope.portfolioId}`;
  if (scope.type === "account") return `account:${scope.accountId}`;
  return `accounts:${scope.accountIds.join(",")}`;
}

function useWorkspaceAccounts() {
  const { t } = useTranslation(["settings", "dashboard"]);
  const { accounts } = useAccounts({ filterActive: false });
  const { data: portfolios = [] } = usePortfolios();
  const selection = useWorkspaceSelection();
  const currentScope = useAccountScopeStore((state) => state.scope);
  const setScope = useAccountScopeStore((state) => state.setScope);
  const [query, setQuery] = useState("");

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

  return {
    t,
    query,
    setQuery,
    selection,
    groups,
    view,
    chosen,
    label,
    accountName,
    ungrouped,
  };
}

export function WorkspaceAccountChoices() {
  const { t, query, setQuery, selection, groups, view, chosen, accountName, ungrouped } =
    useWorkspaceAccounts();
  const needle = query.trim().toLowerCase();
  const visibleGroups = useMemo(() => {
    if (!needle) return groups;
    return groups
      .map((portfolio) => {
        const nameMatches = portfolio.name.toLowerCase().includes(needle);
        return {
          ...portfolio,
          accountIds: nameMatches
            ? portfolio.accountIds
            : portfolio.accountIds.filter((id) =>
                (accountName.get(id) ?? "").toLowerCase().includes(needle),
              ),
        };
      })
      .filter(
        (portfolio) =>
          portfolio.name.toLowerCase().includes(needle) || portfolio.accountIds.length > 0,
      );
  }, [accountName, groups, needle]);
  const visibleUngrouped = needle
    ? ungrouped.filter((account) => account.name.toLowerCase().includes(needle))
    : ungrouped;

  return (
    <>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("dashboard:portfolio_filter.search")}
        aria-label={t("dashboard:portfolio_filter.search")}
      />
      <div className="max-h-80 space-y-1 overflow-y-auto">
        {visibleGroups.map((portfolio) => {
          const source = groups.find((item) => item.id === portfolio.id) ?? portfolio;
          const check = portfolioCheck(source, selection, groups);
          return (
            <div
              key={portfolio.id}
              className="border-border border-t pt-1 first:border-t-0 first:pt-0"
            >
              <ScopeChoice
                label={portfolio.name}
                icon={<Icons.Folder className="text-muted-foreground size-4 shrink-0" />}
                checked={check === "all"}
                partial={check === "some"}
                onClick={() => selection.setSelection(togglePortfolio(selection, source, groups))}
              />
              {portfolio.accountIds.map((accountId) => (
                <ScopeChoice
                  key={accountId}
                  label={accountName.get(accountId) ?? accountId}
                  icon={<Icons.Wallet className="text-muted-foreground size-4 shrink-0" />}
                  checked={chosen.has(accountId)}
                  nested
                  onClick={() =>
                    selection.setSelection(toggleAccount(selection, accountId, groups))
                  }
                />
              ))}
            </div>
          );
        })}
        {visibleUngrouped.length > 0 && (
          <div className="border-border border-t pt-1">
            <p className="text-muted-foreground px-1 py-1 text-xs">
              {t("workspace.otherAccounts")}
            </p>
            {visibleUngrouped.map((account) => (
              <ScopeChoice
                key={account.id}
                label={account.name}
                icon={<Icons.Wallet className="text-muted-foreground size-4 shrink-0" />}
                checked={chosen.has(account.id)}
                onClick={() => selection.setSelection(toggleAccount(selection, account.id, groups))}
              />
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
    </>
  );
}

export function WorkspaceFilter() {
  const { t, view, label } = useWorkspaceAccounts();
  const [open, setOpen] = useState(false);
  const mobile = useIsMobileViewport();

  const triggerIcon = (
    <span className="relative" aria-hidden="true">
      <Icons.ListFilter className="size-4" />
      {!view.isAll && (
        <span className="bg-primary absolute -end-0.5 -top-0.5 size-2 rounded-full" />
      )}
    </span>
  );

  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button variant="outline" size="icon-sm" className="rounded-full" aria-label={label} />
          }
        >
          {triggerIcon}
        </SheetTrigger>
        <SheetContent side="bottom" className="mx-1 flex max-h-[80dvh] flex-col rounded-t-2xl p-0">
          <SheetHeader className="border-border border-b px-6 py-4">
            <SheetTitle>{t("dashboard:portfolio_filter.choose")}</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
            <WorkspaceAccountChoices />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

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
      <PopoverContent align="end" collisionPadding={8} className="w-80 space-y-2 p-2">
        <WorkspaceAccountChoices />
      </PopoverContent>
    </Popover>
  );
}
