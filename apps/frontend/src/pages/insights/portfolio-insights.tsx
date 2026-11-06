import { useHouseholdReport } from "@/features/household/household-report-context";
import { SwipablePage, SwipablePageView } from "@/components/page";

import { useAccountScopeStore } from "@/lib/account-scope-store";
import IncomePage from "@/pages/income/income-page";
import PerformancePage from "@/pages/performance/performance-page";
import { Button, Icons } from "@wealthfolio/ui";
import { Card, CardContent, CardHeader } from "@wealthfolio/ui/components/ui/card";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { Suspense, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { OverviewPage } from "./overview/overview-page";

// Loading skeleton to show while the dashboard is loading
const DashboardLoader = () => {
  const { t } = useTranslation();
  return (
    <div className="flex h-full w-full flex-col space-y-4 p-4">
      <Card>
        <CardHeader className="space-y-2">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
      <div className="flex items-center justify-center py-8">
        <span className="text-muted-foreground text-sm">
          {t("insights:insights.loading_dashboard")}
        </span>
      </div>
    </div>
  );
};

export default function PortfolioInsightsPage() {
  const { t } = useTranslation();
  const family = useHouseholdReport();
  const storedAccountFilter = useAccountScopeStore((state) => state.scope);
  const accountFilter = useMemo(
    () => (family ? ({ type: "all" } as const) : storedAccountFilter),
    [family, storedAccountFilter],
  );
  const setAccountScope = useAccountScopeStore((state) => state.setScope);
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "overview";
  const [overviewToolbarActions, setOverviewToolbarActions] = useState<ReactNode | null>(null);
  const [performanceToolbarActions, setPerformanceToolbarActions] = useState<ReactNode | null>(
    null,
  );
  const [incomeToolbarActions, setIncomeToolbarActions] = useState<ReactNode | null>(null);
  const [currencyAction, setCurrencyAction] = useState<ReactNode | null>(null);
  const [stockOnly, setStockOnly] = useState(false);

  const [customizeAction, setCustomizeAction] = useState<ReactNode | null>(null);

  const holdingsActions = useMemo(
    () =>
      overviewToolbarActions ?? (
        <div className="flex items-center gap-2">
          {currencyAction}
          {!family && (
            <Button
              variant={stockOnly ? "default" : "outline"}
              size="icon-sm"
              aria-label={t("insights:exposure.stock_only")}
              title={t("insights:exposure.stock_only")}
              aria-pressed={stockOnly}
              onClick={() => setStockOnly((value) => !value)}
            >
              <Icons.Layers className="size-4" />
            </Button>
          )}
          {customizeAction}
        </div>
      ),
    [overviewToolbarActions, currencyAction, customizeAction, family, stockOnly, t],
  );

  // Define the views with icons
  const views: SwipablePageView[] = useMemo(
    () => [
      {
        value: "overview",
        label: t("insights:insights.tab_overview"),
        icon: Icons.PieChart,
        content: (
          <Suspense fallback={<DashboardLoader />}>
            <OverviewPage
              filter={accountFilter}
              stockOnly={stockOnly}
              onFilterChange={setAccountScope}
              onToolbarActionsChange={setOverviewToolbarActions}
              onCustomizeActionChange={setCustomizeAction}
              onCurrencyActionChange={setCurrencyAction}
            />
          </Suspense>
        ),
        actions: holdingsActions,
      },
      {
        value: "performance",
        label: t("insights:insights.tab_performance"),
        icon: Icons.TrendingUp,
        content: (
          <Suspense fallback={<DashboardLoader />}>
            <PerformancePage
              onToolbarActionsChange={
                activeTab === "performance" ? setPerformanceToolbarActions : undefined
              }
            />
          </Suspense>
        ),
        actions: performanceToolbarActions,
        workspaceFilterSide: "start",
      },
      {
        value: "income",
        label: t("insights:insights.tab_income"),
        icon: Icons.HandCoins,
        content: (
          <Suspense fallback={<DashboardLoader />}>
            <IncomePage
              onToolbarActionsChange={activeTab === "income" ? setIncomeToolbarActions : undefined}
            />
          </Suspense>
        ),
        actions: incomeToolbarActions,
      },
    ],
    [
      accountFilter,
      activeTab,
      holdingsActions,
      incomeToolbarActions,
      performanceToolbarActions,
      setAccountScope,
      stockOnly,
      t,
    ],
  );

  return <SwipablePage views={views} defaultView="overview" withPadding={true} />;
}
