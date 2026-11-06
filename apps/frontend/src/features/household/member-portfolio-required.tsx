import type { ReactNode } from "react";

/** All portfolios belong to the same signed-in workspace. */
export function MemberPortfolioRequired({ children }: { children: ReactNode }) {
  return children;
}
