import { useAssets } from "@/pages/asset/hooks/use-assets";
import { useHouseholdReport } from "@/features/household/household-report-context";
import { getFundExposure, refreshFundComposition } from "@/adapters";
import { refreshMissingFundCompositions } from "@/features/fund-exposure/automatic-composition-refresh";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MemberPortfolioRequired } from "@/features/household/member-portfolio-required";
import { TopMoversCard, ConcentrationCard } from "./holdings-highlight-cards";
import { useAccounts } from "@/hooks/use-accounts";
import { useCurrentValuation } from "@/hooks/use-current-account-valuations";
import { useHoldings } from "@/hooks/use-holdings";
import { usePortfolioAllocations } from "@/hooks/use-portfolio-allocations";
import { usePortfolios } from "@/hooks/use-portfolios";
import { HoldingType, isAlternativeAssetKind } from "@/lib/constants";
import { portfolioDayChange } from "@/lib/portfolio-day-change";
import { useSettingsContext } from "@/lib/settings-provider";
import type { AccountScope, AllocationTarget, TaxonomyAllocation } from "@/lib/types";
import { OverviewTab } from "@/pages/allocation-targets/components/overview-tab";
import { RebalanceTab } from "@/pages/allocation-targets/components/rebalance-tab";
import {
  TargetDetailHeader,
  TargetToolbarActions,
} from "@/pages/allocation-targets/components/target-detail-header";
import {
  accountScopeFromTarget,
  accountScopeKey,
  filterTargetsByScope,
} from "@/pages/allocation-targets/components/target-scope";
import { TargetsTab } from "@/pages/allocation-targets/components/targets-tab";
import { UnsavedTargetChangesDialog } from "@/pages/allocation-targets/components/unsaved-target-changes-dialog";
import { useAllocationTargetDrift } from "@/pages/allocation-targets/hooks/use-allocation-target-drift";
import { useAllocationTargets } from "@/pages/allocation-targets/hooks/use-allocation-targets";
import { AllocationDetailSheet } from "@/pages/holdings/components/allocation-detail-sheet";
import {
  Button,
  AnimatedToggleGroup,
  Icons,
  Skeleton,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@wealthfolio/ui";
import { PortfolioComposition } from "@/pages/holdings/components/composition-chart";
import { DrillableAccountChart } from "@/pages/holdings/components/drillable-account-chart";
import { DrillableDonutChart } from "@/pages/holdings/components/drillable-donut-chart";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { computeValueStrip, valueStripFromCurrentSummary } from "./allocation-derivations";
import { PortfolioExplorer } from "./portfolio-explorer";
import { TargetRailsCard } from "./target-rails-card";
import { ValueWidget } from "./value-strip";
import { InsightsDashboard } from "./insights-dashboard";
import { buildStockOnlyOverview } from "./stock-only-overview";
import {
  accountCurrencyScale,
  accountValuesInDisplayCurrency,
  allocationsInDisplayCurrency,
  holdingsInDisplayCurrency,
  singleNativeCurrency,
  valueStripInDisplayCurrency,
} from "./overview-display-currency";

interface OverviewPageProps {
  filter?: AccountScope;
  stockOnly?: boolean;
  onFilterChange?: (filter: AccountScope) => void;
  onToolbarActionsChange?: (actions: ReactNode | null) => void;
  onCustomizeActionChange?: (action: ReactNode | null) => void;
  onCurrencyActionChange?: (action: ReactNode | null) => void;
}

type WorkspaceView = "current" | "details" | "targets" | "rebalance";
type TargetEditorMode = "create" | "edit";

export function OverviewPage({
  filter: filterProp,
  stockOnly = false,
  onFilterChange,
  onToolbarActionsChange,
  onCustomizeActionChange,
  onCurrencyActionChange,
}: OverviewPageProps) {
  const family = useHouseholdReport();
  const { t } = useTranslation();
  const { settings } = useSettingsContext();
  const { assets } = useAssets();
  const queryClient = useQueryClient();
  const baseCurrency = settings?.baseCurrency ?? "USD";

  const accountFilter: AccountScope = useMemo(() => filterProp ?? { type: "all" }, [filterProp]);
  const selectedAccountScopeKey = accountScopeKey(accountFilter);

  const {
    holdings,
    dataUpdatedAt: holdingsUpdatedAt,
    isLoading: holdingsLoading,
  } = useHoldings(accountFilter);
  const { currentValuation, isLoading: currentValuationLoading } = useCurrentValuation(
    accountFilter,
    { includeAccounts: true },
  );
  const { allocations, isLoading: allocationsLoading } = usePortfolioAllocations(accountFilter);
  const { accounts } = useAccounts();
  const { data: portfolios = [] } = usePortfolios();
  const { targets: memberTargets, isLoading: targetsLoading } = useAllocationTargets({
    enabled: !family,
  });
  const targets = useMemo(() => (family ? [] : memberTargets), [family, memberTargets]);

  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("current");
  const [targetEditorMode, setTargetEditorMode] = useState<TargetEditorMode>("edit");
  const [targetEditorDirty, setTargetEditorDirty] = useState(false);
  const [pendingWorkspaceView, setPendingWorkspaceView] = useState<WorkspaceView | null>(null);
  const [pendingTargetId, setPendingTargetId] = useState<string | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState(baseCurrency);
  const exposureQuery = useQuery({
    queryKey: ["fund-exposure", baseCurrency, accountFilter],
    queryFn: () => getFundExposure(baseCurrency, accountFilter),
    enabled: stockOnly && !family,
  });
  useEffect(() => {
    if (!stockOnly || !exposureQuery.data) return;
    const candidates = new Set(exposureQuery.data.report.uncoveredFunds);
    for (const snapshot of exposureQuery.data.snapshots) {
      if (!snapshot.imported && snapshot.source.toUpperCase() === "YAHOO") {
        candidates.add(snapshot.assetId);
      }
    }
    void refreshMissingFundCompositions([...candidates], refreshFundComposition).then((count) => {
      if (count > 0) void queryClient.invalidateQueries({ queryKey: ["fund-exposure"] });
    });
  }, [exposureQuery.data, queryClient, stockOnly]);

  useEffect(() => {
    setSelectedTargetId(null);
  }, [selectedAccountScopeKey]);

  const scopedTargets = useMemo(
    () => filterTargetsByScope(targets, accountFilter),
    [targets, accountFilter],
  );
  const scopedLiveTargets = useMemo(
    () => scopedTargets.filter((p) => !p.archivedAt),
    [scopedTargets],
  );
  const isCreatingTarget = workspaceView === "targets" && targetEditorMode === "create";
  const effectiveTargetId =
    !isCreatingTarget &&
    selectedTargetId &&
    scopedLiveTargets.some((p) => p.id === selectedTargetId)
      ? selectedTargetId
      : !isCreatingTarget
        ? (scopedLiveTargets[0]?.id ?? null)
        : null;
  const effectiveTarget = targets.find((p) => p.id === effectiveTargetId) ?? null;
  const targetEditorAccountScope = isCreatingTarget
    ? accountFilter
    : (accountScopeFromTarget(effectiveTarget) ?? accountFilter);

  const {
    driftReport,
    dataUpdatedAt: driftUpdatedAt,
    isLoading: driftLoading,
  } = useAllocationTargetDrift(effectiveTargetId, accountFilter, {
    includeHoldings: workspaceView === "details",
  });

  const isLoading = holdingsLoading || allocationsLoading || currentValuationLoading;
  const targetLoading = targetsLoading || driftLoading;

  const filteredAccountIds = useMemo(() => {
    if (accountFilter.type === "account") return [accountFilter.accountId];
    if (accountFilter.type === "accounts") return accountFilter.accountIds;
    if (accountFilter.type === "portfolio") {
      return portfolios.find((p) => p.id === accountFilter.portfolioId)?.accountIds ?? [];
    }
    return undefined; // "all" → every account
  }, [accountFilter, portfolios]);

  const nativeCurrency = useMemo(
    () => singleNativeCurrency(accounts, filteredAccountIds),
    [accounts, filteredAccountIds],
  );
  const canShowUsd = nativeCurrency === "USD" && baseCurrency !== "USD";
  const nativeScale = useMemo(
    () => accountCurrencyScale(currentValuation?.accounts, "USD"),
    [currentValuation?.accounts],
  );
  const showingUsd = canShowUsd && displayCurrency === "USD" && nativeScale != null;
  const valueScale = showingUsd ? nativeScale : 1;
  const effectiveCurrency = showingUsd ? "USD" : baseCurrency;

  useEffect(() => {
    if (!canShowUsd || nativeScale == null) setDisplayCurrency(baseCurrency);
  }, [baseCurrency, canShowUsd, nativeScale]);

  const currencyAction = useMemo(
    () =>
      canShowUsd && nativeScale != null ? (
        <AnimatedToggleGroup
          aria-label={`${baseCurrency} / USD`}
          items={[
            { value: baseCurrency, label: baseCurrency },
            { value: "USD", label: "USD" },
          ]}
          value={effectiveCurrency}
          onValueChange={setDisplayCurrency}
          size="sm"
        />
      ) : null,
    [baseCurrency, canShowUsd, effectiveCurrency, nativeScale],
  );

  useEffect(() => {
    onCurrencyActionChange?.(currencyAction);
    return () => onCurrencyActionChange?.(null);
  }, [currencyAction, onCurrencyActionChange]);

  const portfolioHoldings = useMemo(
    () =>
      holdings?.filter((h) => {
        if (h.assetKind && isAlternativeAssetKind(h.assetKind)) return false;
        return true;
      }) ?? [],
    [holdings],
  );
  const displayHoldings = useMemo(
    () => holdingsInDisplayCurrency(portfolioHoldings, effectiveCurrency, valueScale),
    [effectiveCurrency, portfolioHoldings, valueScale],
  );
  const stockOverview = useMemo(
    () =>
      exposureQuery.data
        ? buildStockOnlyOverview(
            exposureQuery.data,
            displayHoldings,
            effectiveCurrency,
            valueScale,
            assets,
          )
        : null,
    [assets, displayHoldings, effectiveCurrency, exposureQuery.data, valueScale],
  );
  const analysisHoldings = stockOnly ? (stockOverview?.holdings ?? []) : displayHoldings;

  const nonCashHoldings = useMemo(
    () => displayHoldings.filter((h) => h.holdingType?.toLowerCase() !== "cash"),
    [displayHoldings],
  );
  const totalCash = useMemo(
    () =>
      holdings
        .filter((h) => h.holdingType === HoldingType.CASH)
        .reduce((sum, h) => sum + (h.marketValue.base ?? 0), 0),
    [holdings],
  );
  const availableCash = driftReport?.deployableCash ?? totalCash;
  const rebalanceSourceVersion = `${holdingsUpdatedAt}:${driftUpdatedAt}:${effectiveTarget?.updatedAt ?? ""}`;

  const valueStrip = useMemo(
    () =>
      currentValuation?.summary
        ? valueStripFromCurrentSummary(currentValuation.summary, portfolioHoldings)
        : computeValueStrip(portfolioHoldings, accounts),
    [currentValuation?.summary, portfolioHoldings, accounts],
  );
  const displayValueStrip = useMemo(
    () => valueStripInDisplayCurrency(valueStrip, valueScale),
    [valueScale, valueStrip],
  );
  const dayChange = useMemo(() => portfolioDayChange(displayHoldings), [displayHoldings]);
  const displayAllocations = useMemo(
    () => allocationsInDisplayCurrency(allocations, valueScale),
    [allocations, valueScale],
  );
  const analysisAllocations = stockOnly ? stockOverview?.allocations : displayAllocations;
  const analysisLoading = isLoading || (stockOnly && exposureQuery.isPending);
  const displayAccountValuations = useMemo(
    () => accountValuesInDisplayCurrency(currentValuation?.accounts, effectiveCurrency, valueScale),
    [currentValuation?.accounts, effectiveCurrency, valueScale],
  );
  const analysisAccountValuations = stockOnly
    ? stockOverview?.accountValuations
    : displayAccountValuations;

  // Detail sheet
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [selectedAllocation, setSelectedAllocation] = useState<TaxonomyAllocation | undefined>();
  const [initialCategoryId, setInitialCategoryId] = useState<string | null>(null);

  function openAllocationSheet(allocation: TaxonomyAllocation | undefined, categoryId?: string) {
    if (!allocation) return;
    setSelectedAllocation(allocation);
    setInitialCategoryId(categoryId ?? null);
    setIsSheetOpen(true);
  }

  const startCreateTarget = useCallback(() => {
    setTargetEditorMode("create");
    setWorkspaceView("targets");
  }, []);

  const handleCreateTarget = useCallback(() => {
    if (targetEditorDirty) {
      setPendingTargetId(null);
      setPendingWorkspaceView("targets");
      return;
    }
    startCreateTarget();
  }, [startCreateTarget, targetEditorDirty]);

  const handleEditTarget = useCallback(() => {
    setTargetEditorMode("edit");
    setWorkspaceView("targets");
  }, []);

  const requestTargetChange = useCallback(
    (targetId: string) => {
      if (targetEditorDirty) {
        setPendingTargetId(targetId);
        return;
      }
      setTargetEditorMode("edit");
      setSelectedTargetId(targetId);
    },
    [targetEditorDirty],
  );

  function backTo(view: WorkspaceView) {
    if (targetEditorDirty) {
      setPendingWorkspaceView(view);
      return;
    }
    setTargetEditorDirty(false);
    setWorkspaceView(view);
  }

  function discardTargetChanges() {
    setTargetEditorDirty(false);
    if (pendingTargetId) {
      setTargetEditorMode("edit");
      setSelectedTargetId(pendingTargetId);
      setPendingTargetId(null);
      setPendingWorkspaceView(null);
      return;
    }
    if (!pendingWorkspaceView) return;
    if (pendingWorkspaceView === "targets") {
      startCreateTarget();
    } else {
      setWorkspaceView(pendingWorkspaceView);
    }
    setPendingWorkspaceView(null);
  }

  function handleTargetEditorCancel() {
    const fallbackTargetId =
      selectedTargetId && scopedLiveTargets.some((target) => target.id === selectedTargetId)
        ? selectedTargetId
        : (scopedLiveTargets[0]?.id ?? null);
    setTargetEditorDirty(false);
    setTargetEditorMode("edit");
    setWorkspaceView(fallbackTargetId ? "details" : "current");
  }

  function handleTargetEditorSaved(target: AllocationTarget) {
    const savedScope = accountScopeFromTarget(target);
    if (savedScope && accountScopeKey(savedScope) !== selectedAccountScopeKey) {
      onFilterChange?.(savedScope);
    }
    setTargetEditorDirty(false);
    setTargetEditorMode("edit");
    setSelectedTargetId(target.id);
    setWorkspaceView("details");
  }

  const toolbarActions = useMemo(() => {
    if (workspaceView === "current") return null;

    return (
      <TargetToolbarActions
        targets={scopedLiveTargets}
        selectedTargetId={effectiveTargetId}
        target={effectiveTarget}
        onTargetChange={requestTargetChange}
        onCreateTarget={handleCreateTarget}
        onEditTarget={workspaceView === "details" ? handleEditTarget : undefined}
      />
    );
  }, [
    effectiveTarget,
    effectiveTargetId,
    handleCreateTarget,
    handleEditTarget,
    requestTargetChange,
    scopedLiveTargets,
    workspaceView,
  ]);

  useEffect(() => {
    onToolbarActionsChange?.(toolbarActions);
    return () => onToolbarActionsChange?.(null);
  }, [onToolbarActionsChange, toolbarActions]);

  if (family && workspaceView !== "current")
    return (
      <MemberPortfolioRequired>
        <span />
      </MemberPortfolioRequired>
    );

  if (workspaceView === "targets") {
    return (
      <>
        <div>
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="-ms-2"
                onClick={() => backTo(effectiveTargetId ? "details" : "current")}
              >
                <Icons.ArrowLeft className="me-1.5 h-4 w-4 rtl:rotate-180" />
                {t("insights:insights.back_to_allocation")}
              </Button>
              <span className="bg-border hidden h-5 w-px sm:block" />
              <h2 className="text-foreground text-base font-semibold">
                {t("insights:insights.target_allocation")}
              </h2>
            </div>
          </div>
          {targetsLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <TargetsTab
              targets={scopedLiveTargets}
              selectedTargetId={effectiveTargetId}
              onTargetChange={(targetId) => {
                setTargetEditorMode("edit");
                setSelectedTargetId(targetId);
              }}
              editorMode={targetEditorMode}
              accountScope={targetEditorAccountScope}
              onAccountScopeChange={onFilterChange}
              onUnsavedChange={setTargetEditorDirty}
              onCancel={handleTargetEditorCancel}
              onSaved={handleTargetEditorSaved}
              actionsPlacement="page-header"
            />
          )}
        </div>
        <UnsavedTargetChangesDialog
          open={pendingWorkspaceView !== null || pendingTargetId !== null}
          onOpenChange={(open) => {
            if (!open) {
              setPendingWorkspaceView(null);
              setPendingTargetId(null);
            }
          }}
          onDiscard={discardTargetChanges}
        />
      </>
    );
  }

  if (workspaceView === "rebalance") {
    return (
      <div>
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            variant="ghost"
            size="sm"
            className="-ms-2 shrink-0"
            onClick={() => backTo("details")}
          >
            <Icons.ArrowLeft className="me-1.5 h-4 w-4 rtl:rotate-180" />
            {t("insights:insights.back_to_overview")}
          </Button>
          <span className="bg-border hidden h-5 w-px sm:block" />
          <h2 className="text-foreground min-w-0 text-base font-semibold">
            {t("insights:insights.rebalance")}
          </h2>
        </div>
        <RebalanceTab
          profile={effectiveTarget ?? null}
          driftReport={driftReport ?? null}
          accountScope={accountFilter}
          holdings={holdings}
          availableCash={availableCash}
          sourceVersion={rebalanceSourceVersion}
          isSourceLoading={holdingsLoading || driftLoading || !driftReport}
        />
      </div>
    );
  }

  if (workspaceView === "details") {
    return (
      <div>
        <TargetDetailHeader
          targets={scopedLiveTargets}
          selectedTargetId={effectiveTargetId}
          target={effectiveTarget}
          onBack={() => backTo("current")}
          onTargetChange={requestTargetChange}
          onCreateTarget={handleCreateTarget}
          onEditTarget={handleEditTarget}
          showActions={false}
        />
        {driftReport ? (
          <OverviewTab
            report={driftReport}
            taxonomyId={effectiveTarget?.taxonomyId ?? "asset_classes"}
            targetName={effectiveTarget?.name}
            target={effectiveTarget}
            onRebalanceClick={() => setWorkspaceView("rebalance")}
          />
        ) : targetLoading ? (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {<Icons.Target className="text-muted-foreground size-10" />}
              </EmptyMedia>
              <EmptyTitle>{t("insights:insights.no_target_selected")}</EmptyTitle>
              <EmptyDescription>
                {t("insights:insights.no_target_selected_description")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" onClick={handleCreateTarget}>
                {t("insights:insights.set_target_allocation")}
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        {stockOnly && exposureQuery.isError && (
          <span className="text-destructive text-sm">{t("insights:exposure.load_error")}</span>
        )}
        {stockOnly && stockOverview && stockOverview.unexpandedValue > 0 && (
          <span className="text-muted-foreground text-sm">
            {t("insights:exposure.coverage_short")}
          </span>
        )}
      </div>
      <InsightsDashboard
        onCustomizeActionChange={onCustomizeActionChange}
        widgets={{
          value: (
            <ValueWidget
              metric="value"
              data={displayValueStrip}
              currency={effectiveCurrency}
              isLoading={isLoading}
            />
          ),
          cash: (
            <ValueWidget
              metric="cash"
              data={displayValueStrip}
              currency={effectiveCurrency}
              isLoading={isLoading}
            />
          ),
          invested: (
            <ValueWidget
              metric="invested"
              data={displayValueStrip}
              currency={effectiveCurrency}
              isLoading={isLoading}
            />
          ),
          bookCost: (
            <ValueWidget
              metric="bookCost"
              data={displayValueStrip}
              currency={effectiveCurrency}
              isLoading={isLoading}
            />
          ),
          pnl: (
            <ValueWidget
              metric="pnl"
              data={displayValueStrip}
              currency={effectiveCurrency}
              isLoading={isLoading}
            />
          ),
          daily: (
            <ValueWidget
              metric="daily"
              data={displayValueStrip}
              dayChange={dayChange}
              currency={effectiveCurrency}
              isLoading={isLoading}
            />
          ),
          accounts: (
            <DrillableAccountChart
              isLoading={isLoading}
              accountIds={filteredAccountIds}
              accountValuations={analysisAccountValuations}
              displayCurrency={effectiveCurrency}
            />
          ),
          classes: (
            <DrillableDonutChart
              title={t("insights:insights.chart_classes")}
              allocation={analysisAllocations?.assetClasses}
              baseCurrency={effectiveCurrency}
              isLoading={analysisLoading}
              onCategoryClick={(categoryId) =>
                !stockOnly && openAllocationSheet(displayAllocations?.assetClasses, categoryId)
              }
              onCardClick={() =>
                !stockOnly && openAllocationSheet(displayAllocations?.assetClasses)
              }
            />
          ),
          regions: (
            <DrillableDonutChart
              title={t("insights:insights.chart_regions")}
              allocation={analysisAllocations?.regions}
              baseCurrency={effectiveCurrency}
              isLoading={analysisLoading}
              onCategoryClick={(categoryId) =>
                !stockOnly && openAllocationSheet(displayAllocations?.regions, categoryId)
              }
              onCardClick={() => !stockOnly && openAllocationSheet(displayAllocations?.regions)}
            />
          ),
          sectors: (
            <DrillableDonutChart
              title={t("insights:insights.chart_sectors")}
              allocation={analysisAllocations?.sectors}
              baseCurrency={effectiveCurrency}
              isLoading={analysisLoading}
              onCategoryClick={(categoryId) =>
                !stockOnly && openAllocationSheet(displayAllocations?.sectors, categoryId)
              }
              onCardClick={() => !stockOnly && openAllocationSheet(displayAllocations?.sectors)}
            />
          ),
          composition: (
            <PortfolioComposition
              holdings={stockOnly ? analysisHoldings : nonCashHoldings}
              currency={effectiveCurrency}
              isLoading={analysisLoading}
              exposureMode={stockOnly}
              sectorByHoldingId={stockOnly ? stockOverview?.sectorByHoldingId : undefined}
            />
          ),
          targets: (
            <TargetRailsCard
              targets={scopedLiveTargets}
              selectedTargetId={effectiveTargetId}
              onTargetChange={requestTargetChange}
              driftReport={driftReport}
              isLoading={driftLoading && !driftReport}
              onCreateTarget={handleCreateTarget}
              onViewDetails={() => setWorkspaceView("details")}
            />
          ),
          movers: (
            <TopMoversCard
              holdings={
                stockOnly
                  ? analysisHoldings.filter((holding) => holding.dayChange != null)
                  : displayHoldings
              }
              currency={effectiveCurrency}
              isLoading={analysisLoading}
            />
          ),
          concentration: (
            <ConcentrationCard
              holdings={analysisHoldings}
              currency={effectiveCurrency}
              isLoading={analysisLoading}
              exposureMode={stockOnly}
            />
          ),
          breakdown: (
            <PortfolioExplorer
              allocations={analysisAllocations}
              holdings={
                stockOnly
                  ? analysisHoldings
                  : holdingsInDisplayCurrency(holdings ?? [], effectiveCurrency, valueScale)
              }
              accounts={accounts}
              accountIds={filteredAccountIds}
              accountValuations={analysisAccountValuations}
              currency={effectiveCurrency}
              isLoading={analysisLoading}
              onOpenAllocation={(allocation, categoryId) => {
                if (!stockOnly) openAllocationSheet(allocation, categoryId);
              }}
            />
          ),
        }}
      />

      <AllocationDetailSheet
        isOpen={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        allocation={selectedAllocation}
        accountFilter={accountFilter}
        baseCurrency={effectiveCurrency}
        valueScale={valueScale}
        initialCategoryId={initialCategoryId}
      />
    </>
  );
}

export default OverviewPage;
