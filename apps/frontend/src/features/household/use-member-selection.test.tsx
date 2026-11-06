import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HouseholdMemberSummary } from "./household-api";
import { useMemberSelection } from "./use-member-selection";

const members = ["first", "second", "third"].map((id) => ({
  id,
  status: "ready" as const,
})) as HouseholdMemberSummary[];

describe("household member selection", () => {
  it("starts combined and lets one click select one, then another member", () => {
    const { result } = renderHook(() => useMemberSelection(members));
    expect([...result.current.activeIds]).toEqual(["first", "second", "third"]);

    act(() => result.current.toggle("first"));
    expect([...result.current.activeIds]).toEqual(["first"]);

    act(() => result.current.toggle("second"));
    expect([...result.current.activeIds]).toEqual(["first", "second"]);

    act(() => result.current.selectAll());
    expect([...result.current.activeIds]).toEqual(["first", "second", "third"]);
  });
});
