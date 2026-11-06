import { describe, expect, it } from "vitest";
import { isHouseholdReportingRoute } from "./household-report-route";

describe("household reporting routes", () => {
  it("keeps member filters in the original reporting pages", () => {
    for (const path of [
      "/",
      "/dashboard",
      "/insights",
      "/holdings",
      "/activities",
      "/goals",
      "/investment-plans",
    ]) {
      expect(isHouseholdReportingRoute(path, "?tab=overview&dir=rtl")).toBe(true);
    }
  });
  it("uses the owner profile only for explicit editing or detail routes", () => {
    expect(isHouseholdReportingRoute("/activities", "?memberEdit=1")).toBe(false);
    expect(isHouseholdReportingRoute("/insights", "?tab=overview&memberEdit=0")).toBe(true);
    for (const path of ["/goals/new", "/settings/accounts", "/holdings/asset"]) {
      expect(isHouseholdReportingRoute(path, "")).toBe(false);
    }
  });
});
