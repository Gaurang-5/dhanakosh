import { expect, test } from "@playwright/test";

test("file import has no API form and broker setup stays with each portfolio account", async ({
  context,
  page,
}) => {
  const created = await context.request.post("/api/v1/profiles/create_profile", {
    data: { name: "Workspace", avatarId: "clay-bot-animated" },
  });
  const profile = await created.json();
  const unlocked = await context.request.post("/api/v1/profiles/unlock_profile", {
    data: { profileId: profile.id },
  });
  const headers = { "x-wf-profile-scope": (await unlocked.json()).scopeId };
  await context.request.put("/api/v1/settings", {
    headers,
    data: {
      onboardingCompleted: true,
      baseCurrency: "INR",
      language: "en",
      timezone: "Asia/Kolkata",
      syncEnabled: false,
    },
  });
  const ids: string[] = [];
  for (const name of ["Gaurang", "Retirement"]) {
    const portfolio = await (
      await context.request.post("/api/v1/portfolios", { headers, data: { name, accountIds: [] } })
    ).json();
    const response = await context.request.post("/api/v1/accounts", {
      headers,
      data: {
        name: "Zerodha",
        accountType: "SECURITIES",
        currency: "INR",
        trackingMode: "TRANSACTIONS",
        isActive: true,
        isDefault: false,
        meta: JSON.stringify({ portfolioId: portfolio.id, country: "IN" }),
      },
    });
    expect(response.ok()).toBeTruthy();
    ids.push((await response.json()).id);
  }
  // Only the external broker boundary is simulated. No real credentials or broker calls.
  const connections = new Map<string, boolean>();
  const connectedAccounts: string[] = [];
  await page.route("**/api/v1/broker-connections", async (route) => {
    const { accountId, operation } = route.request().postDataJSON();
    if (operation.action === "connect") {
      connections.set(accountId, true);
      connectedAccounts.push(accountId);
    }
    if (operation.action === "disconnect") connections.delete(accountId);
    await route.fulfill({
      json: { configured: connections.has(accountId), holdings: null, fetchedAt: null },
    });
  });
  await page.goto("/import");
  await expect(page.getByRole("button", { name: "All portfolios", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Upload CSV File", exact: true })).toBeVisible();
  await expect(page.locator("#kite-key, #kite-token, #broker-provider")).toHaveCount(0);
  await page.goto("/connect");
  await expect(page.locator('#direct-account optgroup[label="Gaurang"] option')).toHaveAttribute(
    "value",
    ids[0],
  );
  await expect(page.locator('#direct-account optgroup[label="Retirement"] option')).toHaveAttribute(
    "value",
    ids[1],
  );
  for (const id of ids) {
    await page.locator("#direct-account").selectOption(id);
    await expect(page.getByText("Not connected", { exact: true })).toBeVisible();
    if (!(await page.locator("#direct-key").isVisible()))
      await page.getByText("Connect or renew login", { exact: true }).click();
    await expect(page.locator("#direct-key")).toHaveValue("");
    await expect(page.locator("#direct-secret")).toHaveValue("");
    await page.locator("#direct-key").fill("fake-key");
    await page.locator("#direct-secret").fill("fake-secret");
    if (!(await page.locator("#direct-token").isVisible()))
      await page.getByText("Manual login / fallback", { exact: true }).click();
    await page.locator("#direct-token").fill("fake-token");
    await page.getByRole("button", { name: "Connect and preview holdings", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Remove saved connection", exact: true }),
    ).toBeVisible();
  }
  expect(connectedAccounts).toEqual(ids);
  await page.getByRole("button", { name: "Remove saved connection", exact: true }).click();
  await expect(page.getByText("Not connected", { exact: true })).toBeVisible();
  await page.locator("#direct-account").selectOption(ids[0]);
  await expect(page.getByRole("button", { name: "Fetch holdings", exact: true })).toBeVisible();
  await context.request.put("/api/v1/settings", { headers, data: { language: "ar" } });
  await page.goto("/connect?dir=rtl");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.locator("#direct-account").selectOption(ids[0]);
  await expect(page.getByRole("button", { name: "Fetch holdings", exact: true })).toBeVisible();
});
