import { expect, test, type BrowserContext } from "@playwright/test";

async function member(context: BrowserContext, name: string) {
  const created = await context.request.post("/api/v1/profiles/create_profile", {
    data: { name, avatarId: "clay-bot-animated" },
  });
  expect(created.ok()).toBeTruthy();
  const profile = await created.json();
  const opened = await context.request.post("/api/v1/profiles/unlock_profile", {
    data: { profileId: profile.id },
  });
  const headers = { "x-wf-profile-scope": (await opened.json()).scopeId };
  expect(
    (
      await context.request.put("/api/v1/settings", {
        headers,
        data: {
          onboardingCompleted: true,
          baseCurrency: "INR",
          timezone: "Asia/Kolkata",
          language: "en",
          syncEnabled: false,
        },
      })
    ).ok(),
  ).toBeTruthy();
  return { headers, profile };
}

test("broker setup is isolated to a member and exposes no credentials", async ({
  context,
  page,
}) => {
  const a = await member(context, "Broker member A");
  const accountResponse = await context.request.post("/api/v1/accounts", {
    headers: a.headers,
    data: {
      name: "Zerodha account",
      accountType: "SECURITIES",
      currency: "INR",
      trackingMode: "TRANSACTIONS",
      isActive: true,
      isDefault: false,
    },
  });
  expect(accountResponse.ok()).toBeTruthy();
  const account = await accountResponse.json();
  const request = { accountId: account.id, provider: "zerodha", operation: { action: "status" } };
  const status = await context.request.post("/api/v1/broker-connections", {
    headers: a.headers,
    data: request,
  });
  expect(status.ok()).toBeTruthy();
  expect(await status.json()).toEqual({ configured: false, holdings: null, fetchedAt: null });
  const b = await member(context, "Broker member B");
  expect(
    (
      await context.request.post("/api/v1/broker-connections", {
        headers: b.headers,
        data: request,
      })
    ).status(),
  ).toBe(400);
  const reopened = await context.request.post("/api/v1/profiles/unlock_profile", {
    data: { profileId: a.profile.id },
  });
  a.headers["x-wf-profile-scope"] = (await reopened.json()).scopeId;
  const invalid = await context.request.post("/api/v1/broker-connections", {
    headers: a.headers,
    data: {
      ...request,
      operation: { action: "connect", apiKey: "", apiSecret: "", loginToken: "" },
    },
  });
  expect(invalid.status()).toBe(400);
  const blocked = await context.request.get(
    `/api/v1/secrets?secretKey=direct_broker_v1:zerodha:${account.id}`,
    { headers: a.headers },
  );
  expect(blocked.status()).toBe(400);
  await page.goto("/connect");
  await page.getByRole("button", { name: "Broker member A", exact: true }).first().click();
  // Connections explicitly selects the writable member before showing its accounts.
  const memberButton = page.getByRole("button", { name: "Broker member A", exact: true });
  if (await memberButton.count()) await memberButton.last().click();
  await page.getByLabel("Investment account (INR)").selectOption(account.id);
  await expect(page.getByText("Not connected", { exact: true })).toBeVisible();
  await page.getByText("Connect or renew login", { exact: true }).click();
  await page.getByText("Manual login / fallback", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Connect and preview holdings" })).toBeDisabled();
  await page.getByLabel("Broker", { exact: true }).selectOption("icici");
  await expect(page.getByLabel("API_Session", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.request.put("/api/v1/settings", { headers: a.headers, data: { language: "ar" } });
  await page.goto("/connect?dir=rtl");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByLabel("Investment account (INR)")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/broker-connections-rtl.png" });
});

test("Zerodha callback completes once without copying a token", async ({ context, page }) => {
  const a = await member(context, "OAuth member");
  const accountResponse = await context.request.post("/api/v1/accounts", {
    headers: a.headers,
    data: {
      name: "OAuth account",
      accountType: "SECURITIES",
      currency: "INR",
      trackingMode: "TRANSACTIONS",
      isActive: true,
      isDefault: false,
    },
  });
  expect(accountResponse.ok()).toBeTruthy();
  const account = await accountResponse.json();
  let connections = 0;
  await context.route("**/api/v1/broker-connections", async (route) => {
    const data = route.request().postDataJSON();
    if (data.operation.action !== "connect") return route.continue();
    expect(data.accountId).toBe(account.id);
    expect(data.provider).toBe("zerodha");
    expect(data.operation).toEqual({
      action: "connect",
      apiKey: "fixture-key",
      apiSecret: "fixture-secret",
      loginToken: "fixture-token",
    });
    connections++;
    await route.fulfill({
      json: { configured: true, holdings: [], fetchedAt: "2026-10-25T00:00:00Z" },
    });
  });
  // No real broker traffic or credentials: emulate only its documented redirect.
  await context.route("https://kite.zerodha.com/**", async (route) => {
    const login = new URL(route.request().url());
    const state = new URLSearchParams(login.searchParams.get("redirect_params")!).get("state")!;
    const callback = new URL("/broker-callback.html", "http://127.0.0.1:18388");
    callback.search = new URLSearchParams({
      state,
      request_token: "fixture-token",
      status: "success",
    }).toString();
    await route.fulfill({ status: 302, headers: { location: callback.toString() } });
  });
  await page.goto("/connect");
  await page.getByRole("button", { name: "OAuth member", exact: true }).first().click();
  const selector = page.getByRole("button", { name: "OAuth member", exact: true });
  if (await selector.count()) await selector.last().click();
  await page.getByLabel("Investment account (INR)").selectOption(account.id);
  await page.getByText("Connect or renew login", { exact: true }).click();
  await expect(page.getByLabel("Registered redirect URL")).toHaveValue(
    "http://127.0.0.1:18388/broker-callback.html",
  );
  await page.getByLabel("API key", { exact: true }).fill("fixture-key");
  await page.getByLabel("API secret", { exact: true }).fill("fixture-secret");
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Connect with Zerodha", exact: true }).click();
  const popup = await popupPromise;
  await expect(page.getByText("Current broker holdings", { exact: true })).toBeVisible();
  expect(connections).toBe(1);
  await expect.poll(() => popup.isClosed()).toBe(true);
  await expect(page.getByLabel("API key", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("API secret", { exact: true })).toHaveValue("");
});
