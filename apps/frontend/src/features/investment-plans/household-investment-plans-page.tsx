import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button, Icons, Input, Label, Skeleton, useDateFormatting } from "@wealthfolio/ui";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@wealthfolio/ui/components/ui/empty";
import { Page, PageContent, PageHeader } from "@/components/page";
import {
  getHouseholdInvestmentPlans,
  localHouseholdDate,
} from "@/features/household/household-api";
import { useHouseholdScope } from "@/features/household/household-scope";
import { installmentDate } from "./schedule";
import { SipPlanCard, SipSummary } from "./plan-card";
import { monthlyTotals } from "./plan-form";

export function HouseholdInvestmentPlansPage() {
  const { t } = useTranslation("common");
  const scope = useHouseholdScope();
  const dates = useDateFormatting();
  const [month, setMonth] = useState(localHouseholdDate().slice(0, 7));
  const query = useQuery({
    queryKey: ["household-investment-plans"],
    queryFn: getHouseholdInvestmentPlans,
  });
  const members = useMemo(
    () => query.data?.filter((member) => scope?.memberIds.includes(member.memberId)) ?? [],
    [query.data, scope],
  );
  const plans = members.flatMap((member) => member.plans);
  const activePlans = plans.filter((plan) => !plan.paused);

  return (
    <Page>
      <PageHeader heading={t("sip.title")} />
      <PageContent className="space-y-6">
        <p className="text-muted-foreground max-w-3xl text-sm">{t("sip.familyHelp")}</p>
        <div className="space-y-2">
          <Label htmlFor="family-sip-month">{t("sip.month")}</Label>
          <Input
            id="family-sip-month"
            className="w-auto"
            type="month"
            value={month}
            onChange={(event) => {
              if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) setMonth(event.target.value);
            }}
          />
        </div>
        <SipSummary
          countLabel={t("sip.active")}
          count={activePlans.length}
          totalLabel={t("sip.total")}
          totals={monthlyTotals(activePlans)}
        />
        {query.isPending ? (
          <div className="space-y-3" role="status">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : null}
        {query.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {t("sip.unavailable")}
          </p>
        ) : null}
        {!query.isPending && members.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Icons.CalendarDots />
              </EmptyMedia>
              <EmptyTitle>{t("sip.title")}</EmptyTitle>
              <EmptyDescription>{t("sip.empty")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {members.map((member) => (
          <section key={member.memberId} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">{member.memberName}</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  scope?.selectMember(member.memberId, "/investment-plans?memberEdit=1")
                }
              >
                {t("sip.manage")}
              </Button>
            </div>
            {member.plans.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("sip.empty")}</p>
            ) : (
              member.plans.map((plan) => {
                const due = installmentDate(plan, month);
                return (
                  <SipPlanCard
                    key={plan.id}
                    name={plan.name}
                    amount={plan.amount}
                    currency={plan.currency}
                    badgeLabel={
                      plan.paused ? t("sip.paused") : due ? t("sip.due") : t("sip.outside")
                    }
                    badgeVariant={plan.paused ? "secondary" : due ? "info-subtle" : "outline"}
                    dueLabel={due ? t("sip.dueOn", { date: dates.formatCalendarDate(due) }) : null}
                  />
                );
              })
            )}
          </section>
        ))}
      </PageContent>
    </Page>
  );
}
