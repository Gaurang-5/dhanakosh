import type { AccountScope } from "@/lib/types";
import { create } from "zustand";

function sameAccountScope(left: AccountScope, right: AccountScope): boolean {
  if (left.type !== right.type) return false;
  switch (left.type) {
    case "all":
      return true;
    case "account":
      return right.type === "account" && left.accountId === right.accountId;
    case "portfolio":
      return right.type === "portfolio" && left.portfolioId === right.portfolioId;
    case "accounts":
      return (
        right.type === "accounts" &&
        left.accountIds.length === right.accountIds.length &&
        left.accountIds.every((id, index) => id === right.accountIds[index])
      );
  }
}

interface AccountScopeState {
  scope: AccountScope;
  setScope: (scope: AccountScope) => void;
  /** `accountScopeKey` of the scope last applied to the performance tracked list. */
  bridgedScopeKey: string;
  /** Item id the bridge inserted, or null when it adopted an existing item. */
  bridgedItemId: string | null;
  releaseBridgedItem: (itemId: string) => void;
  setBridged: (bridgedScopeKey: string, bridgedItemId: string | null) => void;
}

/**
 * Session-scoped account/portfolio selection shared by insights, holdings and
 * income. Deliberately not persisted: the selection resets on relaunch.
 */
export const useAccountScopeStore = create<AccountScopeState>()((set) => ({
  scope: { type: "all" },
  // Same selection must not notify. The portfolio menu republishes its scope
  // while account data is still loading, and a fresh object each time loops.
  setScope: (scope) => set((state) => (sameAccountScope(state.scope, scope) ? state : { scope })),
  // Seeded with the default scope's key so a fresh session never rewrites the
  // performance tracked list before the user picks a scope.
  bridgedScopeKey: "all",
  bridgedItemId: null,
  // A manual removal ends ownership even if the same item is later re-added.
  releaseBridgedItem: (itemId) =>
    set((state) => (state.bridgedItemId === itemId ? { bridgedItemId: null } : state)),
  setBridged: (bridgedScopeKey, bridgedItemId) => set({ bridgedScopeKey, bridgedItemId }),
}));
