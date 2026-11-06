import { expect, test } from "@playwright/test";

test("imports transactions into explicit portfolio accounts, with a default only for blank accounts", async ({
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

  await page.goto("/import");
  const selector = page.getByRole("combobox", { name: /Select an account/i });
  await selector.click();
  await page.getByRole("option", { name: /Retirement \/ Zerodha/ }).click();
  await page.locator('input[type="file"][accept=".csv"]').setInputFiles({
    name: "ownership.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `date,symbol,quantity,activityType,unitPrice,currency,fee,amount,account\n2026-10-20,,0,DEPOSIT,0,INR,0,100,${ids[0]}\n2026-10-21,,0,DEPOSIT,0,INR,0,200,${ids[1]}\n2026-10-22,,0,DEPOSIT,0,INR,0,300,\n`,
    ),
  });
  await page.getByRole("button", { name: /Configure Mapping/i }).click();
  await page.getByRole("button", { name: /Review Assets/i }).click();
  await page.getByRole("button", { name: /Review Activities/i }).click();
  await expect(page.getByText("Gaurang / Zerodha", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Retirement / Zerodha", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: /Continue to Import/i }).click();
  await page.getByRole("button", { name: /Import 3 Activit/i }).click();
  await expect(page.getByText("Import Complete", { exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const res = await context.request.get(`/api/v1/net-worth?accountIds=${ids[0]}`, { headers });
      return Number((await res.json()).netWorth);
    })
    .toBe(100);
  await expect
    .poll(async () => {
      const res = await context.request.get(`/api/v1/net-worth?accountIds=${ids[1]}`, { headers });
      return Number((await res.json()).netWorth);
    })
    .toBe(500);
  await context.request.put("/api/v1/settings", { headers, data: { language: "ar" } });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/import?dir=rtl");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.locator('[role="combobox"]').first().click();
  await expect(page.getByRole("option", { name: /Gaurang \/ Zerodha/ })).toBeVisible();
  await page.getByRole("option", { name: /Retirement \/ Zerodha/ }).click();
  await expect(page.getByText("Retirement / Zerodha", { exact: true }).first()).toBeVisible();
});
