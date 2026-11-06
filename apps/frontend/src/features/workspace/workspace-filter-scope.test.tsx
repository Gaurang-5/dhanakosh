import { useAccountScopeStore } from "@/lib/account-scope-store";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceFilter } from "./workspace-filter";
import { EMPTY_WORKSPACE_SELECTION, useWorkspaceSelection } from "./workspace-selection";

// A new array on every call, which is what the account query does while it loads.
vi.mock("@/hooks/use-accounts", () => ({
  useAccounts: () => ({
    accounts: [
      { id: "mf", name: "Deepa MF's" },
      { id: "ppf", name: "PPF" },
    ],
  }),
}));
vi.mock("@/hooks/use-portfolios", () => ({
  usePortfolios: () => ({
    data: [
      { id: "deepa", name: "Deepa", accountIds: ["mf"] },
      { id: "gaurang", name: "Gaurang", accountIds: ["ppf"] },
    ],
  }),
}));

function ScopeReader() {
  const scope = useAccountScopeStore((state) => state.scope);
  return <span data-testid="scope">{scope.type}</span>;
}

describe("WorkspaceFilter scope publishing", () => {
  beforeEach(() => {
    useAccountScopeStore.getState().setScope({ type: "all" });
    useWorkspaceSelection.setState({ ...EMPTY_WORKSPACE_SELECTION });
  });

  it("does not republish the same scope on every render", () => {
    expect(() =>
      render(
        <>
          <ScopeReader />
          <WorkspaceFilter />
        </>,
      ),
    ).not.toThrow();
    expect(screen.getByTestId("scope")).toHaveTextContent("all");
  });

  it("publishes a portfolio choice once", async () => {
    const user = userEvent.setup();
    render(<WorkspaceFilter />);

    await user.click(screen.getByRole("button", { name: "All portfolios" }));
    await user.click(screen.getByRole("checkbox", { name: "Deepa" }));

    await waitFor(() => {
      expect(useAccountScopeStore.getState().scope).toEqual({
        type: "portfolio",
        portfolioId: "deepa",
      });
    });
  });
});
