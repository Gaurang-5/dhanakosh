import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppLauncher } from "./app-launcher";

const updateSettings = vi.fn();
const updatePortfolio = vi.fn();
const recalculatePortfolio = vi.fn();
const toggleBalanceVisibility = vi.fn();

vi.mock("@/hooks/use-accounts", () => ({
  useAccounts: () => ({
    accounts: [{ id: "brokerage", name: "Brokerage", accountType: "SECURITIES" }],
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-holdings", () => ({
  useHoldings: () => ({
    holdings: [
      {
        id: "holding-1",
        holdingType: "security",
        instrument: { id: "asset-aapl", symbol: "AAPL", name: "Apple" },
      },
    ],
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-balance-privacy", () => ({
  useBalancePrivacy: () => ({ isBalanceHidden: false, toggleBalanceVisibility }),
}));

vi.mock("@/hooks/use-calculate-portfolio", () => ({
  useUpdatePortfolioMutation: () => ({ mutate: updatePortfolio, isPending: false }),
  useRecalculatePortfolioMutation: () => ({ mutate: recalculatePortfolio, isPending: false }),
}));

vi.mock("@/lib/settings-provider", () => ({
  useSettingsContext: () => ({ updateSettings }),
}));

vi.mock("@/hooks/use-platform", () => ({
  useIsMobileViewport: () => true,
}));

vi.mock("@/hooks/use-name-comparator", () => ({
  useNameComparator: () => (left: string, right: string) => left.localeCompare(right),
}));

vi.mock("@/hooks/use-persistent-state", () => ({
  usePersistentState: () => [[], vi.fn()],
}));

vi.mock("@/pages/layouts/navigation/app-navigation", () => ({
  useNavigation: () => ({ primary: [], secondary: [], addons: [] }),
}));

vi.mock("@/pages/layouts/navigation/navigation-mode-context", () => ({
  useNavigationMode: () => ({
    isLaunchBar: false,
    setMode: vi.fn(),
    isFocusMode: false,
    toggleFocusMode: vi.fn(),
  }),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub;
Element.prototype.scrollIntoView = () => {};

function openLauncher() {
  act(() => {
    fireEvent.keyDown(document, { key: "k", metaKey: true });
  });
}

describe("AppLauncher quick launch", () => {
  beforeEach(() => {
    updateSettings.mockClear();
    updatePortfolio.mockClear();
    recalculatePortfolio.mockClear();
    toggleBalanceVisibility.mockClear();
  });

  it("lists the quick actions, holdings, and accounts", () => {
    render(
      <MemoryRouter>
        <AppLauncher />
      </MemoryRouter>,
    );

    openLauncher();

    expect(screen.getByText("Quick launch")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Search actions, holdings, or accounts..."),
    ).toBeInTheDocument();
    for (const label of [
      "Theme → Light",
      "Theme → Dark",
      "Theme → System",
      "Update prices",
      "Refresh full history",
      "Record Buy",
      "Record Sell",
      "Import Activities",
      "Hide Balance",
      "AAPL",
      "Brokerage",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByText("Action").length).toBeGreaterThan(0);
  });

  it("runs theme, price update, history refresh, and hide balance", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AppLauncher />
      </MemoryRouter>,
    );
    openLauncher();

    await user.click(screen.getByText("Theme → Light"));
    expect(updateSettings).toHaveBeenCalledWith({ theme: "light" });

    openLauncher();
    await user.click(screen.getByText("Update prices"));
    expect(updatePortfolio).toHaveBeenCalledOnce();

    openLauncher();
    await user.click(screen.getByText("Refresh full history"));
    expect(recalculatePortfolio).toHaveBeenCalledOnce();

    openLauncher();
    await user.click(screen.getByText("Hide Balance"));
    expect(toggleBalanceVisibility).toHaveBeenCalledOnce();
  });
});
