import { useLayoutEffect } from "react";
import { create } from "zustand";

const useFilterHostCount = create<{ count: number }>(() => ({ count: 0 }));

export function useWorkspaceFilterHosted() {
  return useFilterHostCount((state) => state.count > 0);
}

/** Marks the page header as the place the portfolio menu is rendered. */
export function useRetainWorkspaceFilterHost() {
  useLayoutEffect(() => {
    useFilterHostCount.setState((state) => ({ count: state.count + 1 }));
    return () => useFilterHostCount.setState((state) => ({ count: state.count - 1 }));
  }, []);
}
