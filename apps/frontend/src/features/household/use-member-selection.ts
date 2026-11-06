import { useMemo, useState } from "react";
import type { HouseholdMemberSummary } from "./household-api";

export function useMemberSelection(members: HouseholdMemberSummary[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null);
  const availableIds = useMemo(
    () => members.filter((member) => member.status === "ready").map((member) => member.id),
    [members],
  );
  const activeIds = useMemo(
    () =>
      selectedIds === null
        ? new Set(availableIds)
        : new Set([...selectedIds].filter((id) => availableIds.includes(id))),
    [availableIds, selectedIds],
  );

  const toggle = (id: string) => {
    if (!availableIds.includes(id)) return;
    setSelectedIds((current) => {
      if (current === null || current.size === availableIds.length) return new Set([id]);
      const next = new Set(current);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next.size === availableIds.length ? null : next;
    });
  };

  return { activeIds, selectAll: () => setSelectedIds(null), toggle };
}
