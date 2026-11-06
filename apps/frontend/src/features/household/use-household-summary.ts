import { useQuery } from "@tanstack/react-query";
import { getHouseholdSummary, localHouseholdDate } from "./household-api";

export function useHouseholdSummary(includeHoldings = false) {
  const date = localHouseholdDate();
  return useQuery({
    queryKey: ["household-summary", date, includeHoldings],
    queryFn: () => getHouseholdSummary(date, includeHoldings),
    staleTime: 30_000,
  });
}
