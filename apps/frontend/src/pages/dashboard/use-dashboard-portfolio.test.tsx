import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAccountScopeStore } from "@/lib/account-scope-store";
import { useDashboardPortfolio } from "./use-dashboard-portfolio";
vi.mock("@/hooks/use-portfolios", () => ({
  usePortfolios: () => ({ data: [], isPending: false, error: null, refetch: vi.fn() }),
}));
describe("shared dashboard scope", () => {
  beforeEach(() => useAccountScopeStore.getState().setScope({ type: "all" }));
  it("uses the combined workspace by default", () => {
    expect(renderHook(useDashboardPortfolio).result.current.scope).toEqual({ type: "all" });
  });
  it("follows selections made outside the dashboard and keeps them across navigation", () => {
    const hook = renderHook(useDashboardPortfolio);
    act(() =>
      useAccountScopeStore
        .getState()
        .setScope({ type: "accounts", accountIds: ["bank", "broker"] }),
    );
    expect(hook.result.current.scope).toEqual({ type: "accounts", accountIds: ["bank", "broker"] });
    hook.unmount();
    expect(renderHook(useDashboardPortfolio).result.current.scope).toEqual({
      type: "accounts",
      accountIds: ["bank", "broker"],
    });
  });
  it("never falls back to all wealth for an empty selection", () => {
    useAccountScopeStore.getState().setScope({ type: "accounts", accountIds: [] });
    expect(renderHook(useDashboardPortfolio).result.current.scope).toEqual({
      type: "accounts",
      accountIds: [],
    });
  });
});
