import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/apps/frontend/package.json");
const { utils, write } = require("xlsx");

test("Default import accepts Excel and selects one worksheet on desktop and RTL", async ({
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

  const book = utils.book_new();
  utils.book_append_sheet(
    book,
    utils.aoa_to_sheet([
      ["date", "symbol", "quantity", "unitPrice", "activityType", "currency"],
      ["2026-01-02", "EXCEL-FIRST", 1.234567, 100, "BUY", "INR"],
    ]),
    "Trades",
  );
  utils.book_append_sheet(
    book,
    utils.aoa_to_sheet([
      ["date", "symbol", "quantity", "unitPrice", "activityType", "currency"],
      ["2026-01-03", "EXCEL-SECOND", 2, 100, "BUY", "INR"],
    ]),
    "Other",
  );
  await page.goto(`/import?account=${account.id}`);
  const upload = page.locator('input[type="file"][accept=".csv,.xls,.xlsx"]');
  await upload.setInputFiles({
    name: "history.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: write(book, { type: "buffer", bookType: "xlsx" }),
  });
  await page.getByLabel("Excel worksheet").selectOption("Trades");
  await expect(page.getByRole("table")).toContainText("EXCEL-FIRST");
  await expect(page.getByRole("table")).toContainText("1.234567");
  await expect(page.getByRole("table")).not.toContainText("EXCEL-SECOND");
  await page.getByLabel("Excel worksheet").selectOption("Other");
  await expect(page.getByRole("table")).toContainText("EXCEL-SECOND");
  await expect(page.getByRole("table")).not.toContainText("EXCEL-FIRST");

  const valueResearchBook = utils.book_new();
  utils.book_append_sheet(
    valueResearchBook,
    utils.aoa_to_sheet([
      ["Value Research Transaction History"],
      ["Investor", "Example Investor"],
      [],
      [
        "Transaction Date",
        "Scheme Name",
        "Folio Number",
        "Transaction Type",
        "Amount",
        "Units",
        "NAV",
        "Balance Units",
        "Market Value",
        "ISIN",
      ],
      [
        "02-Jan-26",
        "VALUE RESEARCH FUND",
        "12345/67",
        "SIP Investment",
        -5000,
        4.125,
        1212.1212,
        4.125,
        5000,
        "INF000000001",
      ],
      ["Grand Total", "", "", "", 5000],
    ]),
    "Mutual Funds & SIFs",
  );
  await page.goto(`/import?account=${account.id}`);
  await upload.setInputFiles({
    name: "value-research.xls",
    mimeType: "application/vnd.ms-excel",
    buffer: write(valueResearchBook, { type: "buffer", bookType: "biff8" }),
  });
  await page.getByLabel("Excel worksheet").selectOption("Mutual Funds & SIFs");
  await expect(page.getByRole("table")).toContainText("VALUE RESEARCH FUND");
  await expect(page.getByRole("table")).toContainText("BUY");
  await expect(page.getByRole("table")).not.toContainText("Grand Total");
  await page.getByRole("button", { name: "Configure Mapping" }).click();
  await expect(page.getByText("1 total rows")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review Assets" })).toBeEnabled();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/import?account=${account.id}&dir=rtl`);
  await upload.setInputFiles({
    name: "history.xls",
    mimeType: "application/vnd.ms-excel",
    buffer: write(book, { type: "buffer", bookType: "biff8" }),
  });
  await page.getByLabel("Excel worksheet").selectOption("Trades");
  await expect(page.getByRole("table")).toContainText("EXCEL-FIRST");
  const result = await context.request.post("/api/v1/activities/search", {
    headers,
    data: { page: 0, pageSize: 10 },
  });
  expect((await result.json()).data).toHaveLength(0);
});
