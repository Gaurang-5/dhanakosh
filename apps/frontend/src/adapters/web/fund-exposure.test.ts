import { installProfileSession } from "@/features/profiles/session";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "./core";

beforeEach(() => {
  installProfileSession({ profileId: "test", scopeId: "scope-test" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("posts the reporting currency and account scope when loading fund exposure", async () => {
  const result = {
    currency: "INR",
    positions: [],
    snapshots: [],
    report: { contributions: [], unexpandedValue: "0", uncoveredFunds: [] },
  };
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const payload = { currency: "INR", filter: { type: "all" } };
  expect(await invoke("get_fund_exposure", payload)).toEqual(result);

  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/v1/fund-exposure/query");
  expect(options?.method).toBe("POST");
  expect(options?.body).toBe(JSON.stringify(payload));
  expect(new Headers(options?.headers).get("Content-Type")).toBe("application/json");
  expect(new Headers(options?.headers).get("x-wf-profile-scope")).toBe("scope-test");
});

it.each([
  ["preview_fund_composition", { assetId: "fund-1", source: "issuer", asOf: "2026-09-30" }],
  ["refresh_fund_composition", { assetId: "fund-1" }],
  ["remove_fund_composition", { assetId: "fund-1" }],
])("posts the payload for %s", async (command, payload) => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  await invoke(command, payload);

  expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify(payload));
});
