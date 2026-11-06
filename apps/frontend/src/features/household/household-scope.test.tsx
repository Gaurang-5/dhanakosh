import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { HouseholdScopeProvider, useHouseholdScope } from "./household-scope";

const mocks = vi.hoisted(() => ({ selectProfile: vi.fn() }));
vi.mock("@/adapters", () => ({ isWeb: true }));
vi.mock("@/features/profiles/profile-context", () => ({
  useProfile: () => ({
    profile: { id: "a" },
    profiles: [
      { id: "a", name: "A", lockEnabled: false },
      { id: "b", name: "B", lockEnabled: false },
    ],
    selectProfile: mocks.selectProfile,
  }),
}));

function Controls() {
  const scope = useHouseholdScope()!;
  const location = useLocation();
  return (
    <>
      <button onClick={() => scope.setMemberIds(["b"])}>Filter B</button>
      <button onClick={() => scope.selectAll()}>All</button>
      <button onClick={() => scope.selectMember("b", "/activities?activity=trade")}>Edit B</button>
      <output>
        {JSON.stringify({
          ids: scope.memberIds,
          reporting: scope.isFamily,
          path: location.pathname + location.search,
        })}
      </output>
    </>
  );
}

describe("household filter versus owner switching", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.selectProfile.mockReset();
  });
  it("filters one member and back without switching profiles or leaving Overview", () => {
    render(
      <MemoryRouter initialEntries={["/insights?tab=overview"]}>
        <HouseholdScopeProvider>
          <Controls />
        </HouseholdScopeProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("Filter B"));
    expect(screen.getByRole("status").textContent).toContain('"ids":["b"]');
    expect(screen.getByRole("status").textContent).toContain('"reporting":true');
    expect(screen.getByRole("status").textContent).toContain("/insights?tab=overview");
    fireEvent.click(screen.getByText("All"));
    expect(screen.getByRole("status").textContent).toContain('"ids":["a","b"]');
    expect(mocks.selectProfile).not.toHaveBeenCalled();
  });
  it("still switches to the owner when editing a transaction", async () => {
    render(
      <MemoryRouter initialEntries={["/activities"]}>
        <HouseholdScopeProvider>
          <Controls />
        </HouseholdScopeProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("Edit B"));
    await waitFor(() => expect(mocks.selectProfile).toHaveBeenCalledWith("b"));
  });
});
