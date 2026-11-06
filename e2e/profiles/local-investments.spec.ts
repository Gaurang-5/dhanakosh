import { expect, test, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";

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

test("local plans persist per member and rejected previews never write activities", async ({
  context,
  page,
}) => {
  const a = await member(context, "SIP test member");
  const accountResponse = await context.request.post("/api/v1/accounts", {
    headers: a.headers,
    data: {
      name: "Test investments",
      accountType: "SECURITIES",
      trackingMode: "TRANSACTIONS",
      currency: "INR",
      isActive: true,
      isDefault: false,
    },
  });
  expect(accountResponse.ok()).toBeTruthy();
  const account = await accountResponse.json();
  const assetResponse = await context.request.post("/api/v1/assets", {
    headers: a.headers,
    data: {
      kind: "INVESTMENT",
      name: "Synthetic mutual fund",
      displayCode: "DEMO-FUND",
      quoteMode: "MANUAL",
      quoteCcy: "INR",
      instrumentType: "EQUITY",
      instrumentSymbol: "DEMO-FUND",
      isActive: true,
    },
  });
  expect(assetResponse.ok(), await assetResponse.text()).toBeTruthy();
  const asset = await assetResponse.json();
  const plan = {
    id: randomUUID(),
    name: "Monthly demo fund",
    accountId: account.id,
    assetId: asset.id,
    amount: "5000",
    currency: "INR",
    dayOfMonth: 31,
    startDate: "2026-01-01",
    endDate: null,
    paused: false,
  };
  const saved = await context.request.put("/api/v1/investment-plans", {
    headers: a.headers,
    data: [plan],
  });
  expect(saved.ok(), await saved.text()).toBeTruthy();
  const plans = await context.request.get("/api/v1/investment-plans", { headers: a.headers });
  expect((await plans.json())[0].name).toBe(plan.name);
  const invalid = await context.request.put("/api/v1/investment-plans", {
    headers: a.headers,
    data: [{ ...plan, amount: "0" }],
  });
  expect(invalid.ok()).toBeFalsy();
  const retained = await context.request.get("/api/v1/investment-plans", { headers: a.headers });
  expect((await retained.json())[0].amount).toBe("5000");
  for (const [path, data] of [
    ["cas", { content: Buffer.from("not a PDF").toString("base64"), password: "test" }],
    ["broker", { provider: "kite", apiKey: "", accessToken: "" }],
  ] as const) {
    const response = await context.request.post(`/api/v1/activities/import/${path}`, {
      headers: a.headers,
      data,
    });
    expect(response.status()).toBe(400);
  }
  const activities = await context.request.post("/api/v1/activities/search", {
    headers: a.headers,
    data: { page: 0, pageSize: 10 },
  });
  expect(activities.ok()).toBeTruthy();
  expect((await activities.json()).data).toEqual([]);
  await page.goto("/investment-plans");
  await expect(page.getByRole("heading", { name: "Monthly demo fund" })).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.dataset.testIdentity = "same-document";
  });
  await page.getByRole("button", { name: "Choose portfolio", exact: true }).click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("checkbox", { name: "SIP test member", exact: true }).check();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-test-identity", "same-document");
  await expect(page.getByRole("heading", { name: "Monthly demo fund" })).toBeVisible();
  await page.getByRole("button", { name: "Manage plans", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Monthly demo fund" })).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  await page.goto("/import?memberEdit=1");
  await page.getByText("Import CAMS / KFintech PDF", { exact: true }).click();
  await page.locator("#cas-pdf").setInputFiles({
    name: "invalid.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("not a PDF"),
  });
  await page.getByRole("button", { name: "Convert and review", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Choose an original CAS PDF" }),
  ).toBeVisible();
  await page.getByText("Broker connection · today’s trades", { exact: true }).click();
  await page.locator("#broker-provider").selectOption("upstox");
  await expect(page.locator("#kite-key")).toHaveCount(0);
  await expect(page.locator("#kite-token")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Preview today’s trades", exact: true }),
  ).toBeDisabled();
  const b = await member(context, "Separate member");
  const separate = await context.request.get("/api/v1/investment-plans", { headers: b.headers });
  expect(await separate.json()).toEqual([]);
  const protect = await context.request.post("/api/v1/profiles/set_profile_password", {
    headers: b.headers,
    data: { proof: null, password: "isolated test password" },
  });
  expect(protect.ok()).toBeTruthy();
  const family = await context.request.get("/api/v1/profiles/household-investment-plans");
  expect(family.ok()).toBeTruthy();
  const members = await family.json();
  expect(members.some((row: { memberId: string }) => row.memberId === b.profile.id)).toBe(false);
  expect(
    members.find((row: { memberId: string }) => row.memberId === a.profile.id).plans[0].name,
  ).toBe(plan.name);
});
