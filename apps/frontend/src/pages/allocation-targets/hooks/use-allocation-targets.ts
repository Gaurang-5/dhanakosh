import { useQuery } from "@tanstack/react-query";
import { listAllocationTargets } from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import type { AllocationTarget } from "@/lib/types";

const EMPTY_ALLOCATION_TARGETS: AllocationTarget[] = [];

export function useAllocationTargets(options: { enabled?: boolean } = {}) {
  const {
    data: targets,
    isLoading,
    isError,
  } = useQuery<AllocationTarget[], Error>({
    queryKey: [QueryKeys.ALLOCATION_TARGETS],
    queryFn: listAllocationTargets,
    enabled: options.enabled,
  });

  return { targets: targets ?? EMPTY_ALLOCATION_TARGETS, isLoading, isError };
}
