import { useAccountScopeStore } from "@/lib/account-scope-store";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Button,
  Icons,
  Input,
  Label,
  Skeleton,
  useDateFormatting,
  useLocalizationSettings,
} from "@wealthfolio/ui";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@wealthfolio/ui/components/ui/empty";
import { Page, PageHeader, PageContent } from "@/components/page";
import {
  createActivity,
  getAssets,
  getInvestmentPlans,
  getQuoteHistory,
  saveInvestmentPlans,
  searchActivities,
  syncMarketData,
} from "@/adapters";
import type { InvestmentPlan } from "@/adapters/shared/investment-plans";
import { useAccounts } from "@/hooks/use-accounts";
import { AccountPurpose } from "@/lib/constants";
import { localHouseholdDate } from "@/features/household/household-api";
import { createAsset } from "@/adapters";
import { buildNewAssetFromSearchResult } from "@/pages/activity/import/utils/asset-review-utils";
import type { SymbolSearchResult } from "@/lib/types";
import { priceOnOrBefore, unitsForAmount } from "./record-installment";
import {
  installmentDate,
  installmentSettled,
  missingLegs,
  planKind,
  purchaseCandidates,
  sipInstallmentMarker,
} from "./schedule";
import { SipPlanCard, SipSummary, type SipBadgeVariant } from "./plan-card";
import { PlanFormSheet } from "./plan-form-sheet";
import {
  assetIsin,
  assetLabel,
  blankPlan,
  monthlyTotals,
  usePlanForm,
  type PlanFormValues,
} from "./plan-form";

interface PlanView {
  plan: InvestmentPlan;
  rank: number;
  badgeLabel: string;
  badgeVariant: SipBadgeVariant;
  dueLabel: string | null;
  settled: boolean;
  matches: { id: string }[];
}

export function InvestmentPlansPage() {
  const { t } = useTranslation("common");
  const client = useQueryClient();
  const scope = useAccountScopeStore((s) => s.scope);
  const { data: portfolios = [] } = usePortfolios();
  const dates = useDateFormatting();
  const localization = useLocalizationSettings();
  const today = localHouseholdDate();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [editing, setEditing] = useState<string>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [marketAsset, setMarketAsset] = useState<SymbolSearchResult>();
  const [destinationMarket, setDestinationMarket] = useState<SymbolSearchResult>();
  const [submitError, setSubmitError] = useState<string>();
  const [isCreatingAsset, setIsCreatingAsset] = useState(false);
  const [recordingId, setRecordingId] = useState<string>();
  const [recordError, setRecordError] = useState<string>();
  const accounts = useAccounts({ accountPurpose: AccountPurpose.HOLDINGS });
  const assets = useQuery({ queryKey: ["sip-assets"], queryFn: getAssets });
  const plans = useQuery({ queryKey: ["investment-plans"], queryFn: getInvestmentPlans });
  const activities = useQuery({
    queryKey: ["sip-purchases", month, "trades"],
    queryFn: async () => {
      const rows = [];
      const [year, m] = month.split("-").map(Number);
      const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
      for (let page = 0; page < 10; page++) {
        const result = await searchActivities(
          page,
          1000,
          { activityTypes: ["BUY", "SELL"], dateFrom: `${month}-01`, dateTo: `${month}-${last}` },
          "",
        );
        rows.push(...result.data);
        if (rows.length >= result.meta.totalRowCount) return rows;
      }
      throw new Error(t("sip.tooMany"));
    },
    enabled: /^\d{4}-(0[1-9]|1[0-2])$/.test(month),
  });
  const form = usePlanForm(today);
  const mutation = useMutation({
    mutationFn: saveInvestmentPlans,
    onSuccess: (data) => {
      client.setQueryData(["investment-plans"], data);
      void client.invalidateQueries({ queryKey: ["household-investment-plans"] });
      closeSheet();
    },
  });

  function closeSheet() {
    setSheetOpen(false);
    setEditing(undefined);
    setMarketAsset(undefined);
    setDestinationMarket(undefined);
    setSubmitError(undefined);
    form.reset(blankPlan(today, accounts.accounts[0]));
  }

  function openCreate() {
    setEditing(undefined);
    setMarketAsset(undefined);
    setDestinationMarket(undefined);
    setSubmitError(undefined);
    form.reset(blankPlan(today, accounts.accounts[0]));
    setSheetOpen(true);
  }

  function openEdit(plan: InvestmentPlan) {
    setEditing(plan.id);
    setMarketAsset(undefined);
    setDestinationMarket(undefined);
    setSubmitError(undefined);
    form.reset({
      name: plan.name,
      kind: planKind(plan),
      accountId: plan.accountId,
      assetId: plan.assetId,
      destinationAssetId: plan.destinationAssetId ?? "",
      amount: plan.amount,
      currency: plan.currency,
      startDate: plan.startDate,
      endDate: plan.endDate ?? "",
      dayOfMonth: plan.dayOfMonth,
    });
    setSheetOpen(true);
  }

  async function resolveAsset(
    selectedId: string,
    market: SymbolSearchResult | undefined,
    currency: string,
  ): Promise<string> {
    if (!market || market.existingAssetId || !selectedId.startsWith("market:")) return selectedId;
    const created = await createAsset(buildNewAssetFromSearchResult(market, currency));
    return created.id;
  }

  async function submit(values: PlanFormValues) {
    setSubmitError(undefined);
    setIsCreatingAsset(true);
    try {
      const assetId = await resolveAsset(values.assetId, marketAsset, values.currency);
      const destinationAssetId =
        values.kind === "STP"
          ? await resolveAsset(values.destinationAssetId, destinationMarket, values.currency)
          : null;
      if (assetId !== values.assetId || destinationAssetId) {
        await client.invalidateQueries({ queryKey: ["sip-assets"] });
      }
      const old = plans.data?.find((plan) => plan.id === editing);
      const plan: InvestmentPlan = {
        ...values,
        assetId,
        kind: values.kind,
        destinationAssetId,
        id: editing ?? crypto.randomUUID(),
        endDate: values.endDate || null,
        paused: old?.paused ?? false,
      };
      mutation.mutate([...(plans.data ?? []).filter((item) => item.id !== editing), plan]);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCreatingAsset(false);
    }
  }

  const isinByAssetId = useMemo(() => {
    const isins = new Map<string, string>();
    for (const asset of assets.data ?? []) {
      const isin = assetIsin(asset);
      if (isin) isins.set(asset.id, isin);
    }
    return isins;
  }, [assets.data]);

  async function priceForInstallment(assetId: string, due: string): Promise<number | null> {
    const saved = priceOnOrBefore(await getQuoteHistory(assetId), due);
    if (saved != null) return saved;
    await syncMarketData([assetId], true);
    return priceOnOrBefore(await getQuoteHistory(assetId), due);
  }

  async function recordInstallment(plan: InvestmentPlan) {
    const due = installmentDate(plan, month);
    if (!due || due > today) return;
    setRecordError(undefined);
    setRecordingId(plan.id);
    let recorded = false;
    try {
      const matches = purchaseCandidates(
        plan,
        month,
        activities.data ?? [],
        localization.timezone,
        isinByAssetId,
      );
      for (const leg of missingLegs(plan, month, matches, isinByAssetId)) {
        const price = await priceForInstallment(leg.assetId, due);
        const quantity = price == null ? "" : unitsForAmount(plan.amount, price);
        if (price == null || !quantity) {
          setRecordError(t("sip.noPrice"));
          if (recorded) await client.invalidateQueries();
          return;
        }
        try {
          await createActivity({
            idempotencyKey: leg.idempotencyKey,
            sourceGroupId: leg.sourceGroupId,
            accountId: plan.accountId,
            activityType: leg.activityType,
            activityDate: due,
            asset: { id: leg.assetId },
            quantity,
            unitPrice: String(price),
            amount: plan.amount,
            currency: plan.currency,
            comment: sipInstallmentMarker(plan, month),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!message.includes("Duplicate activity")) throw error;
        }
        recorded = true;
      }
      await client.invalidateQueries();
    } catch (error) {
      if (recorded) await client.invalidateQueries();
      setRecordError(error instanceof Error ? error.message : String(error));
    } finally {
      setRecordingId(undefined);
    }
  }

  const rows = useMemo(() => {
    const next: PlanView[] = [];
    const accountIsVisible = (id: string) =>
      scope.type === "all" ||
      (scope.type === "account"
        ? scope.accountId === id
        : scope.type === "accounts"
          ? scope.accountIds.includes(id)
          : portfolios
              .find((portfolio) => portfolio.id === scope.portfolioId)
              ?.accountIds.includes(id));
    for (const plan of plans.data ?? []) {
      if (!accountIsVisible(plan.accountId)) continue;
      const due = installmentDate(plan, month);
      const matches = purchaseCandidates(
        plan,
        month,
        activities.data ?? [],
        localization.timezone,
        isinByAssetId,
      );
      const settled = installmentSettled(plan, matches, isinByAssetId);
      let rank = 6;
      let badgeLabel = t("sip.outside");
      let badgeVariant: SipBadgeVariant = "outline";
      if (plan.paused) {
        rank = 5;
        badgeLabel = t("sip.paused");
        badgeVariant = "secondary";
      } else if (!due) {
        rank = 6;
      } else if (activities.isPending) {
        rank = 2;
        badgeLabel = t("sip.checking");
        badgeVariant = "info-subtle";
      } else if (activities.isError) {
        rank = 1;
        badgeLabel = t("sip.unavailable");
        badgeVariant = "warning-subtle";
      } else if (settled) {
        rank = 4;
        badgeLabel = t("sip.candidates", { count: matches.length });
        badgeVariant = "success-subtle";
      } else if (matches.length > 0) {
        rank = 0;
        badgeLabel = t("sip.partial");
        badgeVariant = "warning-subtle";
      } else if (due < today) {
        rank = 0;
        badgeLabel = t("sip.overdue");
        badgeVariant = "destructive-subtle";
      } else {
        rank = 3;
        badgeLabel = t("sip.upcoming");
        badgeVariant = "info-subtle";
      }
      next.push({
        plan,
        rank,
        badgeLabel,
        badgeVariant,
        dueLabel: due ? t("sip.dueOn", { date: dates.formatCalendarDate(due) }) : null,
        settled,
        matches,
      });
    }
    next.sort((a, b) => a.rank - b.rank || a.plan.name.localeCompare(b.plan.name));
    return next;
  }, [
    plans.data,
    month,
    activities.data,
    activities.isPending,
    activities.isError,
    localization.timezone,
    today,
    dates,
    t,
    scope,
    portfolios,
    isinByAssetId,
  ]);

  const activePlans = rows.filter((row) => !row.plan.paused).map((row) => row.plan);
  const pageError =
    plans.error ?? assets.error ?? accounts.error ?? mutation.error ?? submitError ?? recordError;

  return (
    <Page>
      <PageHeader
        heading={t("sip.title")}
        actions={
          <>
            <Button
              size="icon"
              className="sm:hidden"
              aria-label={t("sip.add")}
              onClick={openCreate}
            >
              <Icons.Plus className="size-4" />
            </Button>
            <Button size="sm" className="hidden sm:inline-flex" onClick={openCreate}>
              <Icons.Plus className="me-2 size-4" />
              {t("sip.add")}
            </Button>
          </>
        }
      />
      <PageContent className="space-y-6">
        <p className="text-muted-foreground max-w-3xl text-sm">{t("sip.help")}</p>
        {pageError ? (
          <p role="alert" className="text-destructive text-sm">
            {pageError instanceof Error ? pageError.message : String(pageError)}
          </p>
        ) : null}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <Label htmlFor="sip-month">{t("sip.month")}</Label>
            <Input
              className="w-auto"
              id="sip-month"
              type="month"
              value={month}
              onChange={(event) => {
                if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value))
                  setMonth(event.target.value);
              }}
            />
          </div>
        </div>
        <SipSummary
          countLabel={t("sip.active")}
          count={activePlans.length}
          totalLabel={t("sip.total")}
          totals={monthlyTotals(activePlans).map((total) => ({
            currency: total.currency,
            amount: total.amount,
            label: t(
              total.kind === "SWP"
                ? "sip.kindSwp"
                : total.kind === "STP"
                  ? "sip.kindStp"
                  : "sip.kindSip",
            ),
          }))}
        />
        {activities.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {activities.error instanceof Error ? activities.error.message : t("sip.unavailable")}
          </p>
        ) : null}
        {plans.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : rows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Icons.CalendarDots />
              </EmptyMedia>
              <EmptyTitle>{t("sip.title")}</EmptyTitle>
              <EmptyDescription>{t("sip.empty")}</EmptyDescription>
            </EmptyHeader>
            <Button onClick={openCreate}>
              <Icons.Plus className="me-2 size-4" />
              {t("sip.add")}
            </Button>
          </Empty>
        ) : (
          <div className="grid gap-3">
            {rows.map((row) => {
              const due = installmentDate(row.plan, month);
              const asset = assets.data?.find((item) => item.id === row.plan.assetId);
              const destination = assets.data?.find(
                (item) => item.id === row.plan.destinationAssetId,
              );
              const account = accounts.accounts.find((item) => item.id === row.plan.accountId);
              const holding =
                planKind(row.plan) === "STP" && asset && destination
                  ? t("sip.transferDetail", {
                      from: assetLabel(asset),
                      to: assetLabel(destination),
                    })
                  : asset
                    ? assetLabel(asset)
                    : undefined;
              const detail = [holding, account?.name].filter(Boolean).join(" · ");
              return (
                <SipPlanCard
                  key={row.plan.id}
                  name={row.plan.name}
                  kindLabel={t(
                    planKind(row.plan) === "SWP"
                      ? "sip.kindSwp"
                      : planKind(row.plan) === "STP"
                        ? "sip.kindStp"
                        : "sip.kindSip",
                  )}
                  detail={detail}
                  amount={row.plan.amount}
                  currency={row.plan.currency}
                  badgeLabel={row.badgeLabel}
                  badgeVariant={row.badgeVariant}
                  dueLabel={row.plan.paused ? null : row.dueLabel}
                >
                  {due &&
                  due <= today &&
                  !row.settled &&
                  !activities.isPending &&
                  !activities.isError ? (
                    <Button
                      size="sm"
                      disabled={recordingId != null}
                      onClick={() => void recordInstallment(row.plan)}
                    >
                      {recordingId === row.plan.id ? t("sip.recording") : t("sip.record")}
                    </Button>
                  ) : null}
                  {row.matches.map((activity) => (
                    <Link
                      key={activity.id}
                      className="text-sm font-medium underline-offset-4 hover:underline"
                      to={`/activities?activity=${activity.id}&memberEdit=1`}
                    >
                      {t("sip.reviewPurchase")}
                    </Link>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => openEdit(row.plan)}>
                    {t("sip.edit")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={mutation.isPending}
                    onClick={() =>
                      mutation.mutate(
                        (plans.data ?? []).map((plan) =>
                          plan.id === row.plan.id ? { ...plan, paused: !plan.paused } : plan,
                        ),
                      )
                    }
                  >
                    {row.plan.paused ? t("sip.resume") : t("sip.pause")}
                  </Button>
                </SipPlanCard>
              );
            })}
          </div>
        )}
      </PageContent>
      <PlanFormSheet
        open={sheetOpen}
        title={editing ? t("sip.edit") : t("sip.add")}
        accounts={accounts.accounts}
        assets={(assets.data ?? []).filter((asset) => asset.kind === "INVESTMENT")}
        marketAsset={marketAsset}
        destinationMarket={destinationMarket}
        pending={isCreatingAsset || mutation.isPending || plans.isPending || plans.isError}
        error={
          submitError ?? (mutation.error instanceof Error ? mutation.error.message : undefined)
        }
        form={form}
        onOpenChange={(open) => {
          if (!open) closeSheet();
          else setSheetOpen(true);
        }}
        onMarketAsset={setMarketAsset}
        onDestinationMarket={setDestinationMarket}
        onSubmit={submit}
      />
    </Page>
  );
}
