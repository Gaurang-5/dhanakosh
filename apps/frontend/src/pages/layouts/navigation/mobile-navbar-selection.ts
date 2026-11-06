import { usePersistentState } from "@/hooks/use-persistent-state";
import { useEffect, useState } from "react";

/** Shortcuts on the bar, besides More. Five plus More still fits a phone. */
export const MOBILE_NAVBAR_ITEM_LIMIT = 5;
export const MOBILE_NAVBAR_STORAGE_KEY = "wealthfolio:mobile-navbar-items";
export const MOBILE_NAVBAR_SEARCH_HREF = "#search";

export function mobileNavbarCandidates<T extends { href: string }>(groups: {
  primary: readonly T[];
  secondary: readonly T[];
  connect: T;
  pinnedAddons: readonly T[];
  addonMenuItems: readonly T[];
  search: T;
}): T[] {
  const seen = new Set<string>();
  return [
    ...groups.primary,
    ...groups.secondary,
    groups.connect,
    ...groups.pinnedAddons,
    ...groups.addonMenuItems,
    groups.search,
  ].filter((item) => {
    if (!item.href || seen.has(item.href)) return false;
    seen.add(item.href);
    return true;
  });
}

export function automaticMobileNavbarHrefs(
  primaryHrefs: readonly string[],
  pinnedAddonHrefs: readonly string[],
  isLandscape: boolean,
): string[] {
  const visiblePrimaryCount = isLandscape ? 3 : 2;
  return [
    ...primaryHrefs.slice(0, visiblePrimaryCount),
    ...pinnedAddonHrefs.slice(0, 1),
    MOBILE_NAVBAR_SEARCH_HREF,
  ];
}

/**
 * `saved === null` keeps the built-in bar. A saved list is the user's choice,
 * in the catalog order, dropping shortcuts that no longer exist.
 */
export function resolveMobileNavbarHrefs(input: {
  saved: readonly string[] | null;
  candidateHrefs: readonly string[];
  primaryHrefs: readonly string[];
  pinnedAddonHrefs: readonly string[];
  isLandscape: boolean;
}): string[] {
  if (input.saved == null) {
    const allowed = new Set(input.candidateHrefs);
    return automaticMobileNavbarHrefs(
      input.primaryHrefs,
      input.pinnedAddonHrefs,
      input.isLandscape,
    ).filter((href) => allowed.has(href));
  }

  const chosen = new Set(input.saved);
  return input.candidateHrefs.filter((href) => chosen.has(href)).slice(0, MOBILE_NAVBAR_ITEM_LIMIT);
}

export function useMobileNavbarSelection() {
  return usePersistentState<string[] | null>(MOBILE_NAVBAR_STORAGE_KEY, null);
}

export function useIsLandscape() {
  const [isLandscape, setIsLandscape] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(orientation: landscape)").matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(orientation: landscape)");
    const onOrientationChange = () => setIsLandscape(query.matches);
    onOrientationChange();
    query.addEventListener("change", onOrientationChange);
    return () => query.removeEventListener("change", onOrientationChange);
  }, []);

  return isLandscape;
}
