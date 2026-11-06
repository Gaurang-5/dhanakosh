import { render, screen } from "@/test/render";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ImportRun } from "@/lib/types";

import { PastImportsCard } from "./past-imports-card";

const adapterMocks = vi.hoisted(() => ({
  getAccounts: vi.fn(),
  getImportRuns: vi.fn(),
  undoActivityImport: vi.fn(),
}));

vi.mock("@/adapters", () => adapterMocks);
vi.mock("@/hooks/use-portfolios", () => ({
  usePortfolios: () => ({ data: [{ id: "p1", name: "Personal", accountIds: ["acc-1"] }] }),
}));

function run(overrides: Partial<ImportRun> = {}): ImportRun {
  return {
    id: "run-1",
    accountId: "acc-1",
    sourceSystem: "csv",
    runType: "IMPORT",
    mode: "INCREMENTAL",
    status: "APPLIED",
    startedAt: "2026-03-01T12:00:00.000Z",
    reviewMode: "NEVER",
    summary: {
      fetched: 2,
      inserted: 2,
      updated: 0,
      skipped: 1,
      warnings: 0,
      errors: 0,
      removed: 0,
      fileName: "trades.csv",
    },
    createdAt: "2026-03-01T12:00:00.000Z",
    updatedAt: "2026-03-01T12:00:00.000Z",
    ...overrides,
  };
}

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PastImportsCard />
    </QueryClientProvider>,
  );
}

describe("PastImportsCard", () => {
  beforeEach(() => {
    adapterMocks.getAccounts.mockResolvedValue([{ id: "acc-1", name: "Brokerage" }]);
    adapterMocks.getImportRuns.mockResolvedValue([
      run(),
      run({
        id: "sync-1",
        sourceSystem: "snaptrade",
        runType: "SYNC",
        summary: {
          fetched: 1,
          inserted: 1,
          updated: 0,
          skipped: 0,
          warnings: 0,
          errors: 0,
          removed: 0,
        },
      }),
    ]);
    adapterMocks.undoActivityImport.mockResolvedValue({
      importRun: run({ status: "REVERTED" }),
      removed: 2,
    });
  });

  it("lists csv imports and undoes an applied run after confirmation", async () => {
    const user = userEvent.setup();
    renderCard();

    expect(screen.queryByText("trades.csv")).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Past imports" }));

    expect(await screen.findByText("trades.csv")).toBeInTheDocument();
    expect(screen.getByText(/Personal \/ Brokerage/)).toBeInTheDocument();
    expect(screen.queryByText("snaptrade")).not.toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Import options" }));
    await user.click(await screen.findByRole("menuitem", { name: "Undo" }));
    expect(screen.getByText(/2 transactions from trades.csv/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Undo import" }));
    expect(adapterMocks.undoActivityImport).toHaveBeenCalledWith("run-1");
  });

  it("hides undo after a run is already undone", async () => {
    const user = userEvent.setup();
    adapterMocks.getImportRuns.mockResolvedValue([run({ status: "REVERTED" })]);
    renderCard();

    await user.click(await screen.findByRole("button", { name: "Past imports" }));
    expect(await screen.findByText("Undone")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import options" })).not.toBeInTheDocument();
  });
});
