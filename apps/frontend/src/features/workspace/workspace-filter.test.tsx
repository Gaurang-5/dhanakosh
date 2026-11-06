import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceFilter } from "./workspace-filter";
import { EMPTY_WORKSPACE_SELECTION, useWorkspaceSelection } from "./workspace-selection";

vi.mock("@/hooks/use-accounts", () => ({
  useAccounts: () => ({
    accounts: [
      { id: "mf", name: "Deepa MF's" },
      { id: "stock", name: "Deepa Stock's" },
      { id: "ppf", name: "PPF" },
    ],
  }),
}));
vi.mock("@/hooks/use-portfolios", () => ({
  usePortfolios: () => ({
    data: [
      { id: "deepa", name: "Deepa", accountIds: ["mf", "stock"] },
      { id: "gaurang", name: "Gaurang", accountIds: ["ppf"] },
    ],
  }),
}));
vi.mock("@/lib/account-scope-store", () => ({
  useAccountScopeStore: (
    selector: (state: { scope: { type: "all" }; setScope: () => void }) => unknown,
  ) => selector({ scope: { type: "all" }, setScope: vi.fn() }),
}));

describe("WorkspaceFilter", () => {
  beforeEach(() => {
    useWorkspaceSelection.setState(EMPTY_WORKSPACE_SELECTION);
  });

  it("ticks every account under a portfolio, and one account on its own", async () => {
    const user = userEvent.setup();
    render(<WorkspaceFilter />);

    await user.click(screen.getByRole("button", { name: "All portfolios" }));
    await user.click(screen.getByRole("checkbox", { name: "Deepa" }));

    expect(screen.getByRole("checkbox", { name: "Deepa MF's" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Deepa Stock's" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "PPF" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Deepa" })).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Deepa Stock's" }));

    expect(screen.getByRole("checkbox", { name: "Deepa" })).toHaveAttribute(
      "aria-checked",
      "mixed",
    );
    expect(screen.getByRole("checkbox", { name: "Deepa MF's" })).toBeChecked();
    expect(screen.getByRole("button", { name: "1 account selected" })).toBeInTheDocument();
  });
});
