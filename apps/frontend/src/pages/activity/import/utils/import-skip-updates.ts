import type { DraftActivity } from "../context/import-context";
import { hasDuplicateWarning } from "./draft-utils";

/** An explicit Unskip on a known duplicate is permission to import that row. */
export function applyImportSkipUpdates(
  draft: DraftActivity,
  updates: Partial<DraftActivity>,
): DraftActivity {
  if (updates.status !== "valid") return { ...draft, ...updates };
  const duplicate = hasDuplicateWarning(draft) || draft.status === "duplicate";
  const hasErrors = Object.values(draft.errors).some((messages) => messages.length > 0);
  return {
    ...draft,
    ...updates,
    status: hasErrors
      ? "error"
      : duplicate
        ? "duplicate"
        : Object.keys(draft.warnings).length
          ? "warning"
          : "valid",
    forceImport: duplicate && !hasErrors,
  };
}
