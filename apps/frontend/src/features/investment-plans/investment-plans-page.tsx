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
import { getAssets, getInvestmentPlans, saveInvestmentPlans, searchActivities } from "@/adapters";
import type { InvestmentPlan } from "@/adapters/shared/investment-plans";
import { useAccounts } from "@/hooks/use-accounts";
import { AccountPurpose } from "@/lib/constants";
import { localHouseholdDate } from "@/features/household/household-api";
import { createAsset } from "@/adapters";
import { buildNewAssetFromSearchResult } from "@/pages/activity/import/utils/asset-review-utils";
import type { SymbolSearchResult } from "@/lib/types";
import { installmentDate, purchaseCandidates } from "./schedule";
import { SipPlanCard, SipSummary, type SipBadgeVariant } from "./plan-card";
import { PlanFormSheet } from "./plan-form-sheet";
import {
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
  const [submitError, setSubmitError] = useState<string>();
  const [isCreatingAsset, setIsCreatingAsset] = useState(false);
  const accounts = useAccounts({ accountPurpose: AccountPurpose.HOLDINGS });
  const assets = useQuery({ queryKey: ["sip-assets"], queryFn: getAssets });
  const plans = useQuery({ queryKey: ["investment-plans"], queryFn: getInvestmentPlans });
  const activities = useQuery({
    queryKey: ["sip-purchases", month],
    queryFn: async () => {
      const rows = [];
      const [year, m] = month.split("-").map(Number);
      const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
      for (let page = 0; page < 10; page++) {
        const result = await searchActivities(
          page,
          1000,
          { activityTypes: ["BUY"], dateFrom: `${month}-01`, dateTo: `${month}-${last}` },
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
    setSubmitError(undefined);
    form.reset(blankPlan(today, accounts.accounts[0]));
  }

  function openCreate() {
    setEditing(undefined);
    setMarketAsset(undefined);
    setSubmitError(undefined);
    form.reset(blankPlan(today, accounts.accounts[0]));
    setSheetOpen(true);
  }

  function openEdit(plan: InvestmentPlan) {
    setEditing(plan.id);
    setMarketAsset(undefined);
    setSubmitError(undefined);
    form.reset({
      name: plan.name,
      accountId: plan.accountId,
      assetId: plan.assetId,
      amount: plan.amount,
      currency: plan.currency,
      startDate: plan.startDate,
      endDate: plan.endDate ?? "",
      dayOfMonth: plan.dayOfMonth,
    });
    setSheetOpen(true);
  }

  async function submit(values: PlanFormValues) {
    setSubmitError(undefined);
    let assetId = values.assetId;
    if (marketAsset && !marketAsset.existingAssetId) {
      setIsCreatingAsset(true);
      try {
        const created = await createAsset(
          buildNewAssetFromSearchResult(marketAsset, values.currency),
        );
        assetId = created.id;
        await client.invalidateQueries({ queryKey: ["sip-assets"] });
      } catch (error) {
        setSubmitError(error instanceof Error ? error.message : String(error));
        return;
      } finally {
        setIsCreatingAsset(false);
      }
    }
    const old = plans.data?.find((plan) => plan.id === editing);
    const plan: InvestmentPlan = {
      ...values,
      assetId,
      id: editing ?? crypto.randomUUID(),
      endDate: values.endDate || null,
      paused: old?.paused ?? false,
    };
    mutation.mutate([...(plans.data ?? []).filter((item) => item.id !== editing), plan]);
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
      const matches = purchaseCandidates(plan, month, activities.data ?? [], localization.timezone);
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
      } else if (matches.length > 0) {
        rank = 4;
        badgeLabel = t("sip.candidates", { count: matches.length });
        badgeVariant = "success-subtle";
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
  ]);

  const activePlans = rows.filter((row) => !row.plan.paused).map((row) => row.plan);
  const pageError = plans.error ?? assets.error ?? accounts.error ?? mutation.error ?? submitError;

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
          totals={monthlyTotals(activePlans)}
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
              const asset = assets.data?.find((item) => item.id === row.plan.assetId);
              const account = accounts.accounts.find((item) => item.id === row.plan.accountId);
              const detail = [asset ? assetLabel(asset) : undefined, account?.name]
                .filter(Boolean)
                .join(" · ");
              return (
                <SipPlanCard
                  key={row.plan.id}
                  name={row.plan.name}
                  detail={detail}
                  amount={row.plan.amount}
                  currency={row.plan.currency}
                  badgeLabel={row.badgeLabel}
                  badgeVariant={row.badgeVariant}
                  dueLabel={row.plan.paused ? null : row.dueLabel}
                >
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
        onSubmit={submit}
      />
    </Page>
  );
}
