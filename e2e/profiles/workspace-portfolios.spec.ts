import { expect, test } from "@playwright/test";

test("one workspace combines portfolios and filters accounts by country without switching users", async ({
  context,
  page,
}) => {
  const created = await context.request.post("/api/v1/profiles/create_profile", {
    data: { name: "Workspace", avatarId: "clay-bot-animated" },
  });
  expect(created.ok()).toBeTruthy();
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
  const portfolio = async (name: string) => {
    const result = await context.request.post("/api/v1/portfolios", {
      headers,
      data: { name, accountIds: [] },
    });
    expect(result.ok(), await result.text()).toBeTruthy();
    return result.json();
  };
  const a = await portfolio("Gaurang");
  const b = await portfolio("Retirement");
  const empty = await portfolio("Empty portfolio");
  const accounts = [];
  for (const [name, owner, country, amount] of [
    ["India bank", a.id, "IN", "100"],
    ["Overseas bank", a.id, "US", "200"],
    ["Retirement bank", b.id, "IN", "300"],
  ]) {
    const response = await context.request.post("/api/v1/accounts", {
      headers,
      data: {
        name,
        accountType: "CASH",
        currency: "INR",
        trackingMode: "TRANSACTIONS",
        isActive: true,
        isDefault: false,
        meta: JSON.stringify({ portfolioId: owner, country }),
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const account = await response.json();
    accounts.push(account);
    expect(JSON.parse(account.meta).portfolioId).toBeUndefined();
    expect(JSON.parse(account.meta).country).toBe(country);
    const activity = await context.request.post("/api/v1/activities", {
      headers,
      data: {
        accountId: account.id,
        activityType: "DEPOSIT",
        amount,
        activityDate: "2026-10-20T00:00:00Z",
        currency: "INR",
        fee: "0",
        tax: "0",
        asset: null,
        status: "POSTED",
      },
    });
    expect(activity.ok(), await activity.text()).toBeTruthy();
  }
  const portfolios = await (await context.request.get("/api/v1/portfolios", { headers })).json();
  expect(portfolios.find((p: { id: string }) => p.id === a.id).accountIds.sort()).toEqual(
    accounts
      .slice(0, 2)
      .map((a) => a.id)
      .sort(),
  );
  await expect
    .poll(async () =>
      Number((await (await context.request.get("/api/v1/net-worth", { headers })).json()).netWorth),
    )
    .toBe(600);
  const filtered = await context.request.get(`/api/v1/net-worth?accountIds=${accounts[0].id}`, {
    headers,
  });
  expect(Number((await filtered.json()).netWorth)).toBe(100);
  const zero = await context.request.get("/api/v1/net-worth?accountIds=", { headers });
  expect(Number((await zero.json()).netWorth)).toBe(0);
  // Invalid ownership rolls back the entire account creation.
  const invalid = await context.request.post("/api/v1/accounts", {
    headers,
    data: {
      name: "Must not exist",
      accountType: "CASH",
      currency: "INR",
      trackingMode: "TRANSACTIONS",
      isActive: true,
      isDefault: false,
      meta: JSON.stringify({ portfolioId: "missing", country: "IN" }),
    },
  });
  expect(invalid.ok()).toBeFalsy();
  expect(
    (await (await context.request.get("/api/v1/accounts", { headers })).json()).some(
      (a: { name: string }) => a.name === "Must not exist",
    ),
  ).toBe(false);
  // Moving preserves the account and ledger while replacing its sole owner.
  const moved = await context.request.put(`/api/v1/accounts/${accounts[1].id}`, {
    headers,
    data: {
      ...accounts[1],
      meta: JSON.stringify({ ...JSON.parse(accounts[1].meta), portfolioId: b.id }),
    },
  });
  expect(moved.ok(), await moved.text()).toBeTruthy();
  const after = await (await context.request.get("/api/v1/portfolios", { headers })).json();
  expect(
    after.filter((p: { accountIds: string[] }) => p.accountIds.includes(accounts[1].id)),
  ).toHaveLength(1);
  expect(after.find((p: { id: string }) => p.id === b.id).accountIds).toContain(accounts[1].id);
  const remove = await context.request.delete(`/api/v1/portfolios/${b.id}`, { headers });
  expect(remove.ok()).toBeFalsy();
  await page.goto("/settings/portfolios");
  const chooser = page.getByRole("button", { name: "Workspace", exact: true });
  if (await chooser.count()) await chooser.first().click();
  await expect(page.getByRole("button", { name: "All portfolios", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add portfolio", exact: true }).click();
  await page.locator("#portfolio-name").fill("Created in UI");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "Accounts", exact: true }).click();
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  await page.locator("#account-portfolio").selectOption({ label: "Created in UI" });
  await page.locator("#account-country").fill("US");
  await page.getByTestId("account-name-input").fill("UI brokerage");
  await page.getByRole("radio", { name: "Transactions Track every trade for performance analytics", exact: true }).click();
  await page.getByTestId("account-submit-button").click();
  await expect(page.getByTestId("account-form")).toHaveCount(0);
  await expect(page.getByText("UI brokerage", { exact: true })).toBeVisible();
  const uiPortfolios = await (await context.request.get("/api/v1/portfolios", { headers })).json();
  expect(
    uiPortfolios.find((p: { name: string }) => p.name === "Created in UI").accountIds,
  ).toHaveLength(1);
  await page.evaluate(() => {
    (window as unknown as { workspaceSentinel: string }).workspaceSentinel = "same-session";
  });
  await page.getByRole("button", { name: "All portfolios", exact: true }).click();
  await page.getByLabel("Gaurang", { exact: true }).check();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByLabel("Account country", { exact: true }).selectOption("IN");
  await page.getByRole("link", { name: "Accounts", exact: true }).click();
  await expect(page.getByText("India bank", { exact: true })).toBeVisible();
  await expect(page.getByText("Overseas bank", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Retirement bank", { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { workspaceSentinel: string }).workspaceSentinel,
    ),
  ).toBe("same-session");
  await expect(page.getByText("Switch profile", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Reset filters", exact: true }).click();
  await expect(page.getByText("Retirement bank", { exact: true })).toBeVisible();
  await context.request.put("/api/v1/settings", { headers, data: { language: "ar" } });
  await page.goto("/settings/accounts?dir=rtl");
  await expect(page.getByRole("button", { name: "All portfolios", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/workspace-accounts-mobile.png" });
  expect(empty.id).toBeTruthy();
});
