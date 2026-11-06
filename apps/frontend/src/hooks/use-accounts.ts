import { useHouseholdReport } from "@/features/household/household-report-context";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Account } from "@/lib/types";
import { getAccounts } from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import { AccountPurpose, accountSupportsPurpose } from "@/lib/constants";

export function useAccounts(options?: {
  filterActive?: boolean;
  includeArchived?: boolean;
  accountPurpose?: AccountPurpose;
}) {
  const family = useHouseholdReport();
  const { filterActive = true, includeArchived = false, accountPurpose } = options ?? {};

  const {
    data: memberAccounts = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS, includeArchived],
    queryFn: () => getAccounts(includeArchived),
    enabled: !family,
  });

  const fetchedAccounts = family?.accounts ?? memberAccounts;
  const filteredAccounts = useMemo(() => {
    let accounts = fetchedAccounts;

    // Filter inactive if requested
    if (filterActive) {
      accounts = accounts.filter((a) => a.isActive);
    }

    if (accountPurpose) {
      accounts = accounts.filter((a) => accountSupportsPurpose(a, accountPurpose));
    }

    return accounts;
  }, [accountPurpose, fetchedAccounts, filterActive]);

  return {
    accounts: filteredAccounts,
    isLoading: family ? false : isLoading,
    isError: family ? false : isError,
    error: family ? null : error,
    refetch,
  };
}
