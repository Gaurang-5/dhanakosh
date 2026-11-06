import { getActivities } from "@/adapters";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { QueryKeys } from "@/lib/query-keys";
import type { Holding } from "@/lib/types";
import { AmountDisplay, GainPercent } from "@wealthfolio/ui";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { calculateCashAppreciation } from "./cash-appreciation";

export function CashBalancesSection({
  holdings,
  currency,
  showConvertedValues,
}: {
  holdings: Holding[];
  currency: string;
  showConvertedValues: boolean;
}) {
  const { t } = useTranslation();
  const { isBalanceHidden } = useBalancePrivacy();
  const accountIds = useMemo(
    () => [...new Set(holdings.map((holding) => holding.accountId))].sort(),
    [holdings],
  );
  const shouldLoadFundingHistory = holdings.some(
    (holding) =>
      holding.localCurrency.toUpperCase() === "USD" &&
      holding.localCurrency.toUpperCase() !== holding.baseCurrency.toUpperCase(),
  );
  const activitiesQuery = useQuery({
    queryKey: [QueryKeys.ACTIVITY_DATA, "cash-appreciation", accountIds],
    queryFn: async () =>
      (await Promise.all(accountIds.map((accountId) => getActivities(accountId)))).flat(),
    enabled: shouldLoadFundingHistory && accountIds.length > 0,
  });

  if (holdings.length === 0) return null;
  return (
    <section className="mt-6 rounded-lg border p-4" data-testid="cash-balances-section">
      <h2 className="font-semibold">{t("holdings:cash_balances")}</h2>
      <p className="text-muted-foreground mt-1 text-sm">{t("holdings:cash_ledger_explanation")}</p>
      <div className="mt-4 divide-y">
        {holdings.map((holding) => {
          const appreciation = calculateCashAppreciation(holding, activitiesQuery.data ?? []);
          const displayValue = showConvertedValues
            ? holding.marketValue.base
            : holding.marketValue.local;
          const displayCurrency = showConvertedValues ? currency : holding.localCurrency;

          return (
            <div key={holding.id} className="flex items-center justify-between gap-4 py-3">
              <span>{holding.localCurrency}</span>
              <div className="text-end">
                <AmountDisplay
                  value={displayValue}
                  currency={displayCurrency}
                  isHidden={isBalanceHidden}
                />
                {appreciation && (
                  <div className="text-muted-foreground mt-1 flex items-center justify-end gap-2 text-xs">
                    <span>{t("performance:attribution.fx_effect")}</span>
                    <AmountDisplay
                      value={appreciation.gainBase}
                      currency={currency}
                      colorFormat
                      isHidden={isBalanceHidden}
                    />
                    <GainPercent value={appreciation.gainPct} className="text-xs" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
