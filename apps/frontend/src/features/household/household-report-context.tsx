import { useAccountScopeStore } from "@/lib/account-scope-store";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Skeleton } from "@wealthfolio/ui";
import { useTranslation } from "react-i18next";
import { useSettingsContext } from "@/lib/settings-provider";
import { useHouseholdScope } from "./household-scope";
import {
  combineOverview,
  type HouseholdOverviewData,
  type MemberOverview,
} from "./household-overview-data";

const Context = createContext<HouseholdOverviewData | null>(null);
export function useHouseholdReport() {
  return useContext(Context);
}

export function HouseholdReportProvider({ children }: { children: ReactNode }) {
  const scope = useHouseholdScope();
  useEffect(() => {
    useAccountScopeStore.getState().setScope({ type: "all" });
  }, []);
  const { settings } = useSettingsContext();
  const { t } = useTranslation("common");
  const ids = scope?.memberIds ?? [];
  const currency = settings?.baseCurrency ?? "USD";
  const query = useQuery({
    queryKey: ["household-overview", ids, currency],
    queryFn: async () => {
      const params = new URLSearchParams({ memberIds: ids.join(","), currency });
      const response = await fetch(`/api/v1/profiles/household-overview?${params}`, {
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("Household overview unavailable");
      return combineOverview((await response.json()) as MemberOverview[]);
    },
    enabled: ids.length > 0,
    staleTime: 30_000,
  });
  if (query.isError)
    return (
      <div role="alert" className="space-y-3 p-6">
        <p>{t("profiles.householdLoadError")}</p>
        <Button onClick={() => void query.refetch()}>{t("retry")}</Button>
      </div>
    );
  if (!query.data)
    return (
      <div className="p-6">
        <Skeleton className="h-80" />
      </div>
    );
  return <Context.Provider value={query.data}>{children}</Context.Provider>;
}
