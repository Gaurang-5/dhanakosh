import { describe, expect, it } from "vitest";
import { HOUSEHOLD_NAME, resolveHouseholdMode } from "./household-config";

describe("household configuration", () => {
  it("uses the household experience by default on the web server", () => {
    expect(resolveHouseholdMode(true)).toBe(true);
    expect(resolveHouseholdMode(false)).toBe(false);
    expect(resolveHouseholdMode(true, "false")).toBe(false);
    expect(HOUSEHOLD_NAME).toBe("Bhatia Family");
  });
});
