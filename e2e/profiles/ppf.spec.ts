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
  expect(opened.ok()).toBeTruthy();
  const grant = await opened.json();
  const headers = { "x-wf-profile-scope": grant.scopeId };
  const settings = await context.request.put("/api/v1/settings", {
    headers,
    data: {
      onboardingCompleted: true,
      baseCurrency: "INR",
      timezone: "Asia/Kolkata",
      language: "en",
      syncEnabled: false,
      autoUpdateCheckEnabled: false,
    },
  });
  expect(settings.ok()).toBeTruthy();
  return { profile, headers };
}

test("PPF ledger persists contributions, interest and withdrawals in the family balance", async ({
  context,
  page,
}) => {
  const a = await member(context, "PPF test member");
  const response = await context.request.post("/api/v1/accounts", {
    headers: a.headers,
    data: {
      name: "Test PPF",
      accountType: "SECURITIES",
      currency: "INR",
      trackingMode: "TRANSACTIONS",
      isActive: true,
      isDefault: false,
      group: "PPF",
      meta: JSON.stringify({
        investmentProduct: "PPF",
        allocation: { cashCategoryId: "FIXED_INCOME" },
      }),
    },
  });
  expect(response.ok()).toBeTruthy();
  const account = await response.json();
  for (const [activityType, amount, activityDate] of [
    ["DEPOSIT", "100000", "2025-04-02"],
    ["INTEREST", "7100", "2026-03-31"],
    ["WITHDRAWAL", "10000", "2026-04-05"],
  ]) {
    const posted = await context.request.post("/api/v1/activities", {
      headers: a.headers,
      data: {
        accountId: account.id,
        activityType,
        amount,
        activityDate: `${activityDate}T00:00:00Z`,
        currency: "INR",
        fee: "0",
        tax: "0",
        asset: null,
        status: "POSTED",
      },
    });
    expect(posted.ok(), await posted.text()).toBeTruthy();
  }
  await expect
    .poll(
      async () => {
        const summary = await context.request.get(
          "/api/v1/profiles/household-summary?date=2026-10-25",
        );
        expect(summary.ok()).toBeTruthy();
        return Number((await summary.json()).totalsByCurrency.INR?.netWorth);
      },
      { timeout: 30000 },
    )
    .toBe(97100);
  const sourceResponse = await context.request.post("/api/v1/accounts", {
    headers: a.headers,
    data: {
      name: "Funding account",
      isDefault: false,
      accountType: "SECURITIES",
      currency: "INR",
      trackingMode: "TRANSACTIONS",
      isActive: true,
    },
  });
  expect(sourceResponse.ok(), await sourceResponse.text()).toBeTruthy();
  const source = await sourceResponse.json();
  const funded = await context.request.post("/api/v1/activities", {
    headers: a.headers,
    data: {
      accountId: source.id,
      activityType: "DEPOSIT",
      amount: "1000",
      activityDate: "2026-04-06T00:00:00Z",
      currency: "INR",
      fee: "0",
      tax: "0",
      status: "POSTED",
    },
  });
  expect(funded.ok()).toBeTruthy();
  const transferred = await context.request.post("/api/v1/activities/transfer-pair", {
    headers: a.headers,
    data: {
      fromAccountId: source.id,
      toAccountId: account.id,
      activityDate: "2026-04-07T00:00:00Z",
      sourceAmount: "1000",
      destinationAmount: "1000",
      sourceCurrency: "INR",
      destinationCurrency: "INR",
      transferMode: "cash",
    },
  });
  expect(transferred.ok(), await transferred.text()).toBeTruthy();
  await expect
    .poll(
      async () => {
        const summary = await context.request.get(
          "/api/v1/profiles/household-summary?date=2026-10-25",
        );
        return Number((await summary.json()).totalsByCurrency.INR?.netWorth);
      },
      { timeout: 30000 },
    )
    .toBe(98100);
  await page.goto(`/accounts/${account.id}?memberEdit=1`);
  await page.getByRole("button", { name: "PPF test member", exact: true }).click();
  await expect(page.getByText("Public Provident Fund (PPF)", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Record credited interest", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`account=${account.id}&type=INTEREST`));
  await page.goBack();
  await page.getByRole("button", { name: "Transfer from another account", exact: true }).click();
  await expect(page).toHaveURL(/type=TRANSFER_IN/);
  await page.goto(`/accounts/${account.id}?memberEdit=1`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Add contribution", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const rtl = await context.request.put("/api/v1/settings", {
    headers: a.headers,
    data: { language: "ar" },
  });
  expect(rtl.ok()).toBeTruthy();
  await page.goto(`/accounts/${account.id}?memberEdit=1&dir=rtl`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("button", { name: "Add contribution", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "/tmp/ppf-mobile-rtl.png" });
});
