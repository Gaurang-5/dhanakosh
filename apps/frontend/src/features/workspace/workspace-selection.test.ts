import { describe, expect, it } from "vitest";
import {
  EMPTY_WORKSPACE_SELECTION,
  portfolioCheck,
  toggleAccount,
  togglePortfolio,
  workspaceScopeView,
  type WorkspacePortfolioRef,
} from "./workspace-selection";

const portfolios: WorkspacePortfolioRef[] = [
  { id: "deepa", name: "Deepa", accountIds: ["mf", "stock"] },
  { id: "gaurang", name: "Gaurang", accountIds: ["ppf", "us"] },
];

const everyAccountId = ["mf", "stock", "ppf", "us", "loose"];

describe("workspace selection", () => {
  it("starts as every account", () => {
    expect(workspaceScopeView(EMPTY_WORKSPACE_SELECTION, portfolios, everyAccountId)).toMatchObject(
      {
        scope: { type: "all" },
        isAll: true,
      },
    );
  });

  it("ticks every account when a portfolio is selected", () => {
    const next = togglePortfolio(EMPTY_WORKSPACE_SELECTION, portfolios[0], portfolios);
    expect(portfolioCheck(portfolios[0], next, portfolios)).toBe("all");
    expect(portfolioCheck(portfolios[1], next, portfolios)).toBe("none");
    expect(workspaceScopeView(next, portfolios, everyAccountId)).toMatchObject({
      scope: { type: "portfolio", portfolioId: "deepa" },
      portfolioNames: ["Deepa"],
    });
  });

  it("keeps a single account when one child is cleared", () => {
    const allDeepa = togglePortfolio(EMPTY_WORKSPACE_SELECTION, portfolios[0], portfolios);
    const next = toggleAccount(allDeepa, "stock", portfolios);
    expect(portfolioCheck(portfolios[0], next, portfolios)).toBe("some");
    expect(workspaceScopeView(next, portfolios, everyAccountId)).toMatchObject({
      scope: { type: "accounts", accountIds: ["mf"] },
      portfolioNames: [],
      accountCount: 1,
    });
  });

  it("selects an account on its own", () => {
    const next = toggleAccount(EMPTY_WORKSPACE_SELECTION, "ppf", portfolios);
    expect(portfolioCheck(portfolios[1], next, portfolios)).toBe("some");
    expect(workspaceScopeView(next, portfolios, everyAccountId).scope).toEqual({
      type: "accounts",
      accountIds: ["ppf"],
    });
  });

  it("promotes a portfolio once its last account is ticked", () => {
    const one = toggleAccount(EMPTY_WORKSPACE_SELECTION, "mf", portfolios);
    const next = toggleAccount(one, "stock", portfolios);
    expect(portfolioCheck(portfolios[0], next, portfolios)).toBe("all");
    expect(next.portfolioIds).toEqual(["deepa"]);
  });

  it("names every fully selected portfolio", () => {
    const deepa = togglePortfolio(EMPTY_WORKSPACE_SELECTION, portfolios[0], portfolios);
    const next = togglePortfolio(deepa, portfolios[1], portfolios);
    expect(workspaceScopeView(next, portfolios, everyAccountId).portfolioNames).toEqual([
      "Deepa",
      "Gaurang",
    ]);
  });

  it("returns to every account when the last tick covers them all", () => {
    let selection = EMPTY_WORKSPACE_SELECTION;
    for (const id of everyAccountId) selection = toggleAccount(selection, id, portfolios);
    expect(workspaceScopeView(selection, portfolios, everyAccountId).isAll).toBe(true);
  });
});
