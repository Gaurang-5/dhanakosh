import { describe, expect, it } from "vitest";
import type { HouseholdMemberSummary } from "./household-api";
import { aggregateHouseholdMembers } from "./household-selection";

const members: HouseholdMemberSummary[] = [
  {
    id: "member-1",
    name: "Member 1",
    avatarId: "avatar-1",
    status: "ready",
    currency: "INR",
    assets: "125",
    liabilities: "25",
    netWorth: "100",
    accountsAvailable: true,
    accounts: [],
    holdingsAvailable: true,
    holdings: [],
  },
  {
    id: "member-2",
    name: "Member 2",
    avatarId: "avatar-2",
    status: "ready",
    currency: "INR",
    assets: "250",
    liabilities: "50",
    netWorth: "200",
    accountsAvailable: true,
    accounts: [],
    holdingsAvailable: true,
    holdings: [],
  },
  {
    id: "member-3",
    name: "Member 3",
    avatarId: "avatar-3",
    status: "ready",
    currency: "USD",
    assets: "75",
    liabilities: "5",
    netWorth: "70",
    accountsAvailable: true,
    accounts: [],
    holdingsAvailable: true,
    holdings: [],
  },
  {
    id: "locked-member",
    name: "Locked member",
    avatarId: "avatar-4",
    status: "unavailable",
    currency: null,
    assets: null,
    liabilities: null,
    netWorth: null,
    accountsAvailable: false,
    accounts: [],
    holdingsAvailable: false,
    holdings: [],
  },
];

describe("aggregateHouseholdMembers", () => {
  it("combines only the selected members and keeps currencies separate", () => {
    expect(aggregateHouseholdMembers(members, new Set(["member-1", "member-2"]))).toEqual({
      INR: { assets: 375, liabilities: 75, netWorth: 300 },
    });

    expect(aggregateHouseholdMembers(members, new Set(["member-2", "member-3"]))).toEqual({
      INR: { assets: 250, liabilities: 50, netWorth: 200 },
      USD: { assets: 75, liabilities: 5, netWorth: 70 },
    });
  });

  it("ignores unavailable members", () => {
    expect(aggregateHouseholdMembers(members, new Set(["locked-member"]))).toEqual({});
  });
});
