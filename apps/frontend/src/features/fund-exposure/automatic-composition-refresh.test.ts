import { describe, expect, it, vi } from "vitest";
import { refreshMissingFundCompositions } from "./automatic-composition-refresh";

describe("automatic fund-composition refresh", () => {
  it("deduplicates funds and attempts each fund only once", async () => {
    const attempted = new Set<string>();
    const refresh = vi.fn().mockResolvedValue(undefined);

    await expect(
      refreshMissingFundCompositions(["fund-a", "fund-a", "fund-b"], refresh, attempted),
    ).resolves.toBe(2);
    await expect(
      refreshMissingFundCompositions(["fund-a", "fund-b"], refresh, attempted),
    ).resolves.toBe(0);

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledWith("fund-a");
    expect(refresh).toHaveBeenCalledWith("fund-b");
  });

  it("isolates an unsupported provider response from other funds", async () => {
    const attempted = new Set<string>();
    const refresh = vi.fn((assetId: string) => {
      if (assetId === "unsupported") return Promise.reject(new Error("No composition"));
      return Promise.resolve();
    });

    await expect(
      refreshMissingFundCompositions(
        ["supported-a", "unsupported", "supported-b"],
        refresh,
        attempted,
        2,
      ),
    ).resolves.toBe(2);
    expect(refresh).toHaveBeenCalledTimes(3);
  });
});
