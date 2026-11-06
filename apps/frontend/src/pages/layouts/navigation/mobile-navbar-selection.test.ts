import { describe, expect, it } from "vitest";
import {
  MOBILE_NAVBAR_ITEM_LIMIT,
  MOBILE_NAVBAR_SEARCH_HREF,
  resolveMobileNavbarHrefs,
} from "./mobile-navbar-selection";

const primary = ["/dashboard", "/insights", "/holdings", "/activities"];
const candidates = [
  ...primary,
  "/settings",
  "/connect",
  "/addons/spending",
  MOBILE_NAVBAR_SEARCH_HREF,
];

describe("resolveMobileNavbarHrefs", () => {
  it("keeps the built-in portrait bar until the user chooses", () => {
    expect(
      resolveMobileNavbarHrefs({
        saved: null,
        candidateHrefs: candidates,
        primaryHrefs: primary,
        pinnedAddonHrefs: ["/addons/spending"],
        isLandscape: false,
      }),
    ).toEqual(["/dashboard", "/insights", "/addons/spending", MOBILE_NAVBAR_SEARCH_HREF]);
  });

  it("adds a third primary shortcut in landscape when nothing is saved", () => {
    expect(
      resolveMobileNavbarHrefs({
        saved: null,
        candidateHrefs: candidates,
        primaryHrefs: primary,
        pinnedAddonHrefs: [],
        isLandscape: true,
      }),
    ).toEqual(["/dashboard", "/insights", "/holdings", MOBILE_NAVBAR_SEARCH_HREF]);
  });

  it("uses the saved shortcuts in catalog order and ignores removed ones", () => {
    expect(
      resolveMobileNavbarHrefs({
        saved: ["/holdings", "/gone", MOBILE_NAVBAR_SEARCH_HREF, "/dashboard"],
        candidateHrefs: candidates,
        primaryHrefs: primary,
        pinnedAddonHrefs: [],
        isLandscape: false,
      }),
    ).toEqual(["/dashboard", "/holdings", MOBILE_NAVBAR_SEARCH_HREF]);
  });

  it("stops at the bar limit", () => {
    expect(
      resolveMobileNavbarHrefs({
        saved: candidates,
        candidateHrefs: candidates,
        primaryHrefs: primary,
        pinnedAddonHrefs: [],
        isLandscape: true,
      }),
    ).toHaveLength(MOBILE_NAVBAR_ITEM_LIMIT);
  });
});
