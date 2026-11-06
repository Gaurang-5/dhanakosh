vi.mock("@/features/household/household-config", () => ({ HOUSEHOLD_MODE: true }));
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountsSummary } from "./accounts-summary";
import { useQuery } from "@tanstack/react-query";
import { useCurrentValuation } from "@/hooks/use-current-account-valuations";
import { useHoldings } from "@/hooks/use-holdings";
import { useValuationHistory } from "@/hooks/use-valuation-history";
import { useSettingsContext } from "@/lib/settings-provider";
import { DashboardContent } from "./dashboard-content";

const uiMocks = vi.hoisted(() => ({
  realIntervals: false,
  intervalCode: "3M" as "1D" | "3M" | "ALL",
  togglePrivacy: vi.fn(),
}));

vi.mock("@/adapters", () => ({
  calculatePerformanceSummary: vi.fn(),
}));

vi.mock("@/components/privacy-toggle", () => ({
  PrivacyToggle: () => <button onClick={uiMocks.togglePrivacy}>Hide Balance</button>,
}));

vi.mock("@/hooks/use-calculate-portfolio", () => ({
  useUpdatePortfolioMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useRecalculatePortfolioMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/components/history-chart", () => ({
  HistoryChart: () => <div>history-chart</div>,
}));

vi.mock("@/hooks", () => ({
  useHapticFeedback: () => ({ triggerHaptic: vi.fn() }),
}));

vi.mock("@/hooks/use-holdings", () => ({
  useHoldings: vi.fn(),
}));

vi.mock("@/hooks/use-balance-privacy", () => ({
  useBalancePrivacy: () => ({ isBalanceHidden: false, toggle: vi.fn() }),
}));

vi.mock("@/hooks/use-current-account-valuations", () => ({
  useCurrentValuation: vi.fn(),
}));

vi.mock("@/hooks/use-valuation-history", () => ({
  useValuationHistory: vi.fn(),
}));

vi.mock("@/lib/settings-provider", () => ({
  useSettingsContext: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  keepPreviousData: Symbol("keepPreviousData"),
  useQuery: vi.fn(),
}));

vi.mock("@wealthfolio/ui", async () => {
  const { getInitialIntervalData } =
    await import("@wealthfolio/ui/components/financial/interval-selector");
  return {
    AmountDisplay: ({ value }: { value: number }) => <span>{`amount:${value}`}</span>,
    Skeleton: ({ "data-testid": testId }: { "data-testid"?: string }) => (
      <div data-testid={testId}>loading</div>
    ),
    GainAmount: ({ value }: { value: number }) => <span>{`gain-amount:${value}`}</span>,
    GainPercent: ({ value }: { value: number }) => <span>{`gain-percent:${value}`}</span>,
    getInitialIntervalData: (code?: "ALL" | "3M", asOf?: Date) =>
      uiMocks.realIntervals
        ? getInitialIntervalData(code, asOf)
        : code === "ALL"
          ? {
              range: {
                from: new Date("1970-01-01T00:00:00Z"),
                to: new Date("2026-06-24T00:00:00Z"),
              },
              description: "All Time",
            }
          : {
              range: {
                from: new Date("2026-03-01T00:00:00Z"),
                to: new Date("2026-06-01T00:00:00Z"),
              },
              description: "3M",
            },
    IntervalSelector: () => <div>interval-selector</div>,
    usePersistentState: () => [uiMocks.intervalCode, vi.fn()],
    useDateFormatting: () => ({ formatDate: () => "Jun 1, 2026", formatTime: () => "12:30" }),
  };
});

vi.mock("@wealthfolio/ui/components/ui/skeleton", () => ({
  Skeleton: () => <div>loading</div>,
}));

vi.mock("@/pages/dashboard/portfolio-update-trigger", async (importOriginal) => {
  const { PortfolioUpdateTrigger } =
    await importOriginal<typeof import("./portfolio-update-trigger")>();
  return {
    PortfolioUpdateTrigger: ({
      children,
      lastCalculatedAt,
      notices,
    }: {
      children: ReactNode;
      lastCalculatedAt?: string;
      notices?: string[];
    }) => (
      <div>
        <div data-testid="portfolio-notices">{JSON.stringify(notices ?? [])}</div>
        <div data-testid="portfolio-as-of">{lastCalculatedAt ?? ""}</div>
        <PortfolioUpdateTrigger lastCalculatedAt={lastCalculatedAt} notices={notices}>
          {children}
        </PortfolioUpdateTrigger>
      </div>
    ),
  };
});

vi.mock("./accounts-summary", () => ({
  AccountsSummary: vi.fn(() => <div>accounts-summary</div>),
}));

vi.mock("./balance", () => ({
  default: ({ targetValue, isUnavailable }: { targetValue: number; isUnavailable?: boolean }) => (
    <div>{isUnavailable ? "balance:N/A" : `balance:${targetValue}`}</div>
  ),
}));

vi.mock("./goals", () => ({
  default: () => <div>saving-goals</div>,
}));

vi.mock("./top-holdings", () => ({
  default: () => <div>top-holdings</div>,
}));

const mockUseQuery = vi.mocked(useQuery);
const mockUseCurrentValuation = vi.mocked(useCurrentValuation);
const mockUseHoldings = vi.mocked(useHoldings);
const mockUseValuationHistory = vi.mocked(useValuationHistory);
const mockUseSettingsContext = vi.mocked(useSettingsContext);

describe("DashboardContent", () => {
  beforeEach(() => {
    uiMocks.intervalCode = "3M";
    uiMocks.realIntervals = false;
    vi.clearAllMocks();
  });

  function mockCurrentValuation(totalValueBase = 125) {
    mockUseCurrentValuation.mockReturnValue({
      currentValuation: {
        summary: {
          scopeId: "all",
          baseCurrency: "USD",
          cashBalanceBase: 25,
          investmentMarketValueBase: totalValueBase - 25,
          totalValueBase,
          holdingsCount: 2,
          accountCount: 1,
          currencySplit: [],
          cashCurrencySplit: [],
          sourceDataAsOf: "2026-06-01T12:30:00Z",
          calculatedAt: "2026-06-01T13:00:00Z",
          warnings: [],
        },
        accounts: [],
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useCurrentValuation>);
  }

  it("does not pass backend performance warnings to dashboard header notices", () => {
    mockCurrentValuation(125);
    mockUseHoldings.mockReturnValue({
      holdings: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useHoldings>);
    mockUseValuationHistory.mockReturnValue({
      valuationHistory: [
        {
          valuationDate: "2026-06-01",
          totalValueBase: 1000,
          netContributionBase: 900,
          baseCurrency: "USD",
          calculatedAt: "2026-06-01T12:00:00Z",
        },
      ],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useValuationHistory>);
    mockUseSettingsContext.mockReturnValue({
      settings: { baseCurrency: "USD" },
    } as unknown as ReturnType<typeof useSettingsContext>);
    mockUseQuery.mockReturnValue({
      isLoading: false,
      data: {
        scope: { id: "portfolio:all", currency: "USD" },
        period: { startDate: "2026-03-01", endDate: "2026-06-01" },
        mode: "timeWeighted",
        returns: {
          twr: 0.1,
          annualizedTwr: null,
          irr: null,
          annualizedIrr: null,
          valueReturn: 0.1,
        },
        attribution: {
          contributions: 0,
          distributions: 0,
          income: 0,
          realizedPnl: 0,
          unrealizedPnlChange: 100,
          fxEffect: 0,
          fees: 0,
          taxes: 0,
          residual: 0,
        },
        risk: {
          volatility: null,
          maxDrawdown: null,
          peakDate: null,
          troughDate: null,
          recoveryDate: null,
          drawdownDurationDays: null,
        },
        dataQuality: {
          status: "partial",
          warnings: ["Backend performance warning that belongs in Health Center."],
          notApplicableReasons: [],
        },
        series: [],
      },
    } as unknown as ReturnType<typeof useQuery>);

    render(<DashboardContent />);

    expect(screen.getByTestId("portfolio-notices")).toHaveTextContent("[]");
    expect(screen.queryByText(/backend performance warning/i)).not.toBeInTheDocument();
  });

  it("uses scoped current valuation for the dashboard headline", () => {
    mockCurrentValuation(125);
    mockUseHoldings.mockReturnValue({
      holdings: [
        {
          holdingType: "security",
          marketValue: { base: 40, local: 40 },
        },
      ],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useHoldings>);
    mockUseValuationHistory.mockReturnValue({
      valuationHistory: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useValuationHistory>);
    mockUseSettingsContext.mockReturnValue({
      settings: { baseCurrency: "USD" },
    } as unknown as ReturnType<typeof useSettingsContext>);
    mockUseQuery.mockReturnValue({
      isLoading: false,
      data: null,
    } as unknown as ReturnType<typeof useQuery>);

    render(<DashboardContent />);

    expect(screen.getByText("balance:100")).toBeInTheDocument();
    expect(screen.queryByText("balance:40")).not.toBeInTheDocument();
    expect(screen.queryByText("balance:125")).not.toBeInTheDocument();
    expect(screen.getByTestId("portfolio-as-of")).toHaveTextContent("2026-06-01T12:30:00Z");
    expect(screen.getByTestId("portfolio-as-of")).not.toHaveTextContent("2026-06-01T13:00:00Z");
  });

  it("requests all-time valuation history without the 1970 sentinel range", () => {
    uiMocks.intervalCode = "ALL";
    mockCurrentValuation(125);
    mockUseHoldings.mockReturnValue({
      holdings: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useHoldings>);
    mockUseValuationHistory.mockReturnValue({
      valuationHistory: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useValuationHistory>);
    mockUseSettingsContext.mockReturnValue({
      settings: { baseCurrency: "USD" },
    } as unknown as ReturnType<typeof useSettingsContext>);
    mockUseQuery.mockReturnValue({
      isLoading: false,
      data: null,
    } as unknown as ReturnType<typeof useQuery>);

    render(<DashboardContent />);

    expect(mockUseValuationHistory).toHaveBeenCalledWith(
      undefined,
      { type: "all" },
      { enabled: true },
    );
  });

  it("starts dashboard performance queries while valuation history is loading", () => {
    mockCurrentValuation(125);
    mockUseHoldings.mockReturnValue({
      holdings: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useHoldings>);
    mockUseValuationHistory.mockReturnValue({
      valuationHistory: [
        {
          valuationDate: "2026-06-01",
          totalValueBase: 1000,
          netContributionBase: 900,
          baseCurrency: "USD",
          calculatedAt: "2026-06-01T12:00:00Z",
        },
      ],
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof useValuationHistory>);
    mockUseSettingsContext.mockReturnValue({
      settings: { baseCurrency: "USD" },
    } as unknown as ReturnType<typeof useSettingsContext>);
    mockUseQuery.mockReturnValue({
      isLoading: false,
      data: null,
    } as unknown as ReturnType<typeof useQuery>);

    render(<DashboardContent />);

    expect(mockUseQuery).not.toHaveBeenCalled();
    expect(screen.getByText("accounts-summary")).toBeInTheDocument();
    expect(screen.getByTestId("portfolio-day-change")).toHaveTextContent("loading");
  });

  it("does not render a failed current valuation as zero", () => {
    mockUseCurrentValuation.mockReturnValue({
      currentValuation: undefined,
      isLoading: false,
      error: new Error("current valuation failed"),
    } as unknown as ReturnType<typeof useCurrentValuation>);
    mockUseHoldings.mockReturnValue({
      holdings: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useHoldings>);
    mockUseValuationHistory.mockReturnValue({
      valuationHistory: [
        {
          valuationDate: "2026-06-01",
          totalValueBase: 1000,
          netContributionBase: 900,
          baseCurrency: "USD",
          calculatedAt: "2026-06-01T12:00:00Z",
        },
      ],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useValuationHistory>);
    mockUseSettingsContext.mockReturnValue({
      settings: { baseCurrency: "USD" },
    } as unknown as ReturnType<typeof useSettingsContext>);
    mockUseQuery.mockReturnValue({
      isLoading: false,
      data: null,
    } as unknown as ReturnType<typeof useQuery>);

    render(<DashboardContent />);

    expect(screen.getByText("balance:N/A")).toBeInTheDocument();
    expect(screen.queryByText("balance:0")).not.toBeInTheDocument();
    expect(screen.getByTestId("portfolio-as-of")).toHaveTextContent("");
  });
  it("anchors the real preset to the configured day rather than the host day", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-12-31T16:30:00Z"));
      uiMocks.realIntervals = true;
      mockCurrentValuation();
      mockUseSettingsContext.mockReturnValue({
        settings: { baseCurrency: "USD", timezone: "Asia/Shanghai" },
      } as ReturnType<typeof useSettingsContext>);
      mockUseHoldings.mockReturnValue({ holdings: [], isLoading: false } as unknown as ReturnType<
        typeof useHoldings
      >);
      mockUseValuationHistory.mockReturnValue({ valuationHistory: [], isLoading: false });
      mockUseQuery.mockReturnValue({ data: undefined, isLoading: false } as ReturnType<
        typeof useQuery
      >);
      render(<DashboardContent />);
      expect(mockUseValuationHistory).toHaveBeenLastCalledWith(
        {
          from: new Date(2026, 9, 1),
          to: new Date(2027, 0, 1),
        },
        { type: "all" },
        { enabled: true },
      );
    } finally {
      vi.useRealTimers();
    }
  });
  it("uses one portfolio scope for valuation, history, holdings, performance and account rows", async () => {
    mockCurrentValuation();
    mockUseSettingsContext.mockReturnValue({ settings: { baseCurrency: "USD" } } as ReturnType<
      typeof useSettingsContext
    >);
    mockUseHoldings.mockReturnValue({ holdings: [], isLoading: false } as unknown as ReturnType<
      typeof useHoldings
    >);
    mockUseValuationHistory.mockReturnValue({ valuationHistory: [], isLoading: false });
    mockUseQuery.mockReturnValue({ data: null, isLoading: false } as ReturnType<typeof useQuery>);
    const scope = { type: "portfolio", portfolioId: "retirement" } as const;
    render(<DashboardContent scope={scope} scopeLabel="Retirement" accountIds={["account-1"]} />);
    expect(mockUseHoldings).toHaveBeenCalledWith(scope);
    expect(mockUseCurrentValuation).toHaveBeenCalledWith(scope, { includeAccounts: true });
    expect(mockUseValuationHistory.mock.calls.at(-1)?.[1]).toEqual(scope);
    expect(vi.mocked(AccountsSummary).mock.calls.at(-1)?.[0]).toMatchObject({
      accountIds: ["account-1"],
    });
    expect(mockUseQuery).not.toHaveBeenCalled();
    expect(screen.getByText("Retirement")).toBeInTheDocument();
  });

  it("keeps privacy keyboard focus and activation separate from the update hover card", async () => {
    mockCurrentValuation();
    mockUseSettingsContext.mockReturnValue({ settings: { baseCurrency: "USD" } } as ReturnType<
      typeof useSettingsContext
    >);
    mockUseHoldings.mockReturnValue({ holdings: [], isLoading: false } as unknown as ReturnType<
      typeof useHoldings
    >);
    mockUseValuationHistory.mockReturnValue({ valuationHistory: [], isLoading: false });
    mockUseQuery.mockReturnValue({ data: null, isLoading: false } as ReturnType<typeof useQuery>);
    render(<DashboardContent scopeLabel="All Accounts" />);
    expect(screen.queryByText("All Accounts")).not.toBeInTheDocument();

    const privacy = screen.getByRole("button", { name: "Hide Balance" });
    expect(privacy.closest("a")).toBeNull();
    await userEvent.tab();
    expect(privacy).toHaveFocus();
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(screen.queryByRole("button", { name: "Update prices" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    expect(uiMocks.togglePrivacy).toHaveBeenCalledOnce();
    expect(screen.getByText("balance:100")).toBeInTheDocument();
  });

  it("shows the chart-range investment change under the total", () => {
    mockCurrentValuation();
    mockUseSettingsContext.mockReturnValue({ settings: { baseCurrency: "USD" } } as ReturnType<
      typeof useSettingsContext
    >);
    mockUseHoldings.mockReturnValue({
      holdings: [
        {
          id: "h1",
          holdingType: "security",
          dayChange: { base: 10, local: 10 },
          prevCloseValue: { base: 1000, local: 1000 },
        },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useHoldings>);
    mockUseValuationHistory.mockReturnValue({
      valuationHistory: [
        { valuationDate: "2026-03-01", investmentMarketValueBase: 1000, valueStatus: "complete" },
        { valuationDate: "2026-06-01", investmentMarketValueBase: 1100, valueStatus: "complete" },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useValuationHistory>);
    mockUseQuery.mockReturnValue({ data: null, isLoading: false } as ReturnType<typeof useQuery>);
    render(<DashboardContent />);
    const change = screen.getByTestId("portfolio-day-change");
    expect(change).toHaveTextContent("gain-amount:100");
    expect(change).toHaveTextContent("gain-percent:0.1");
    expect(change).toHaveTextContent("past 3 months");
    expect(change.textContent).not.toMatch(/gain-amount:10(?!\d)/);
  });

  it("shows today's holding move when the chart interval is 1D", () => {
    uiMocks.intervalCode = "1D";
    mockCurrentValuation();
    mockUseSettingsContext.mockReturnValue({ settings: { baseCurrency: "USD" } } as ReturnType<
      typeof useSettingsContext
    >);
    mockUseHoldings.mockReturnValue({
      holdings: [
        {
          id: "h1",
          holdingType: "security",
          dayChange: { base: 10, local: 10 },
          prevCloseValue: { base: 1000, local: 1000 },
        },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useHoldings>);
    mockUseValuationHistory.mockReturnValue({
      valuationHistory: [
        { valuationDate: "2026-06-01", investmentMarketValueBase: 1000, valueStatus: "complete" },
        { valuationDate: "2026-06-02", investmentMarketValueBase: 1500, valueStatus: "complete" },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useValuationHistory>);
    mockUseQuery.mockReturnValue({ data: null, isLoading: false } as ReturnType<typeof useQuery>);
    render(<DashboardContent />);
    const change = screen.getByTestId("portfolio-day-change");
    expect(change).toHaveTextContent("gain-amount:10");
    expect(change).toHaveTextContent("gain-percent:0.01");
    expect(change).toHaveTextContent("past day");
  });
});
