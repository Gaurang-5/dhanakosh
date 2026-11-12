import { describe, expect, it } from "vitest";
import { HOUSEHOLD_NAME, resolveHouseholdMode } from "./household-config";

describe("household configuration", () => {
  it("uses the household experience by default on the web server", () => {
    expect(resolveHouseholdMode(true)).toBe(true);
    expect(resolveHouseholdMode(false)).toBe(false);
    expect(resolveHouseholdMode(true, "false")).toBe(false);
    expect(HOUSEHOLD_NAME).toBe("My wealth");
  });

  it("allows release builds to enable the household experience on desktop", () => {
    expect(resolveHouseholdMode(false, "true")).toBe(true);
  });
});
