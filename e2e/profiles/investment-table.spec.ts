import { expect, test } from "@playwright/test";

test("transaction reports retain fractional units through the existing upload and mapping flow in LTR and RTL", async ({
  context,
  page,
}) => {
  const created = await context.request.post("/api/v1/profiles/create_profile", {
    data: { name: "Import checks", avatarId: "clay-bot-animated" },
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
      autoUpdateCheckEnabled: false,
    },
  });
  const portfolio = await (
    await context.request.post("/api/v1/portfolios", {
      headers,
      data: { name: "Import checks", accountIds: [] },
    })
  ).json();
  const response = await context.request.post("/api/v1/accounts", {
    headers,
    data: {
      name: "Overseas",
      accountType: "SECURITIES",
      currency: "USD",
      trackingMode: "TRANSACTIONS",
      isActive: true,
      isDefault: false,
      meta: JSON.stringify({ portfolioId: portfolio.id, country: "US" }),
    },
  });
  expect(response.ok()).toBeTruthy();
  const account = await response.json();
  for (const direction of ["ltr", "rtl"]) {
    // The query override is development-only; use a real RTL locale against
    // the production bundle served by this isolated suite.
    await context.request.put("/api/v1/settings", {
      headers,
      data: { language: direction === "rtl" ? "ar" : "en" },
    });
    await page.goto(`/import?account=${account.id}&dir=${direction}`);
    await expect(page.locator("html")).toHaveAttribute("dir", direction);
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: "synthetic-transactions.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          "Synthetic report\nStatement period,January 2026\n\nSettlement Date,Trade Date,Action,Ticker,Shares,Execution Price,Currency\n2026-01-05,2026-01-02,BUY,AAPL,0.123456789,200.123456,USD\n",
        ),
      });
    await expect(page.getByRole("table")).toContainText("AAPL");
    await expect(page.getByRole("table")).toContainText("0.123456789");
    await expect(page.getByRole("table")).not.toContainText("Statement period");
    // The isolated installation can show a release announcement over the app.
    const update = page.getByRole("heading", { name: "New Update Available" });
    if (await update.isVisible()) {
      await page.getByRole("button", { name: "Remind me later", exact: true }).click();
    }
    await page
      .getByRole("button", {
        name: direction === "rtl" ? "إعداد التعيين" : "Configure Mapping",
        exact: true,
      })
      .click();
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(2);
    await expect(page.getByRole("table")).toContainText("2026-01-02");
    await expect(page.getByRole("table")).not.toContainText("2026-01-05");
    await expect(
      page.getByRole("button", {
        name: direction === "rtl" ? "مراجعة الأصول" : "Review Assets",
        exact: true,
      }),
    ).toBeEnabled();
  }
  const activities = await context.request.post("/api/v1/activities/search", {
    headers,
    data: { page: 0, pageSize: 10 },
  });
  expect(activities.ok()).toBeTruthy();
  expect((await activities.json()).data).toEqual([]);
});
