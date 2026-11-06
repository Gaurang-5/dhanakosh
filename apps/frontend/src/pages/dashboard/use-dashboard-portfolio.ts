import { useAccountScopeStore } from "@/lib/account-scope-store";
import { usePortfolios } from "@/hooks/use-portfolios";

export function useDashboardPortfolio() {
  const scope = useAccountScopeStore((s) => s.scope);
  const setScope = useAccountScopeStore((s) => s.setScope);
  const { data: portfolios = [], isPending, error, refetch } = usePortfolios();
  return {
    scope,
    portfolio:
      scope.type === "portfolio" ? portfolios.find((p) => p.id === scope.portfolioId) : undefined,
    setPortfolioId: (id: string | null) =>
      setScope(id ? { type: "portfolio", portfolioId: id } : { type: "all" }),
    isLoading: isPending,
    error,
    refetch,
  };
}
