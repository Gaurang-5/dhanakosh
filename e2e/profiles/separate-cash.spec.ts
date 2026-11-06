import { expect, test } from "@playwright/test";

test("cash stays outside investment positions on desktop and RTL mobile", async ({
  context,
  page,
}) => {
  const profile = await (
    await context.request.post("/api/v1/profiles/create_profile", {
      data: { name: "Workspace", avatarId: "clay-bot-animated" },
    })
  ).json();
  const grant = await (
    await context.request.post("/api/v1/profiles/unlock_profile", {
      data: { profileId: profile.id },
    })
  ).json();
  const headers = { "x-wf-profile-scope": grant.scopeId };
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
  const portfolio = await (
    await context.request.post("/api/v1/portfolios", {
      headers,
      data: { name: "Investments", accountIds: [] },
    })
  ).json();
  const account = await (
    await context.request.post("/api/v1/accounts", {
      headers,
      data: {
        name: "Broker",
        accountType: "SECURITIES",
        currency: "INR",
        trackingMode: "TRANSACTIONS",
        isActive: true,
        isDefault: false,
        meta: JSON.stringify({ portfolioId: portfolio.id, country: "IN" }),
      },
    })
  ).json();
  const asset = await (
    await context.request.post("/api/v1/assets", {
      headers,
      data: {
        kind: "INVESTMENT",
        name: "Synthetic test investment",
        displayCode: "TEST-CASH-SPLIT",
        quoteMode: "MANUAL",
        quoteCcy: "INR",
        instrumentType: "EQUITY",
        instrumentSymbol: "TEST-CASH-SPLIT",
      },
    })
  ).json();
  const trade = await context.request.post("/api/v1/activities", {
    headers,
    data: {
      accountId: account.id,
      asset: { id: asset.id },
      activityType: "BUY",
      quantity: "10",
      unitPrice: "10",
      amount: "100",
      fee: "0",
      tax: "0",
      currency: "INR",
      activityDate: "2026-10-20T00:00:00Z",
      status: "POSTED",
    },
  });
  expect(trade.ok(), await trade.text()).toBeTruthy();
  const deposit = await context.request.post("/api/v1/activities", {
    headers,
    data: {
      accountId: account.id,
      asset: null,
      activityType: "DEPOSIT",
      amount: "25",
      fee: "0",
      tax: "0",
      currency: "INR",
      activityDate: "2026-10-21T00:00:00Z",
      status: "POSTED",
    },
  });
  expect(deposit.ok(), await deposit.text()).toBeTruthy();
  await expect
    .poll(async () =>
      Number((await (await context.request.get("/api/v1/net-worth", { headers })).json()).netWorth),
    )
    .toBe(125);
  await page.goto("/holdings");
  await expect(page.getByTestId("cash-balances-section")).toBeVisible();
  await expect(page.getByTestId("cash-balances-section")).toContainText("25.00");
  await expect(page.getByRole("table")).toContainText("TEST-CASH-SPLIT");
  await expect(page.getByRole("table")).not.toContainText("Cash Balance");
  await page.goto("/dashboard");
  await expect(page.getByTestId("portfolio-balance")).toContainText("100.00");
  await expect(page.getByRole("link").filter({ hasText: "Broker" }).first()).toContainText(
    "100.00",
  );
  await expect(page.getByTestId("investment-cash-breakdown")).toContainText("Investments");
  await expect(page.getByTestId("investment-cash-breakdown")).toContainText("Cash Balances");
  const sale = await context.request.post("/api/v1/activities", {
    headers,
    data: {
      accountId: account.id,
      asset: { id: asset.id },
      activityType: "SELL",
      quantity: "10",
      unitPrice: "10",
      amount: "100",
      fee: "0",
      tax: "0",
      currency: "INR",
      activityDate: "2026-10-22T00:00:00Z",
      status: "POSTED",
    },
  });
  expect(sale.ok(), await sale.text()).toBeTruthy();
  await expect
    .poll(async () =>
      Number((await (await context.request.get("/api/v1/net-worth", { headers })).json()).netWorth),
    )
    .toBe(25);
  await page.reload();
  await page.getByRole("button", { name: "Search...", exact: true }).click();
  await page.getByPlaceholder("Search actions, holdings, or accounts...").fill("TEST-CASH-SPLIT");
  await expect(page.getByRole("option").filter({ hasText: "TEST-CASH-SPLIT" })).toContainText(
    "Closed",
  );
  await page.keyboard.press("Escape");
  await context.request.put("/api/v1/settings", { headers, data: { language: "ar" } });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/holdings?dir=rtl");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByTestId("cash-balances-section")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
