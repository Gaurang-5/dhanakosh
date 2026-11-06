#!/usr/bin/env node

const apiBase = process.env.WF_DEMO_API_URL ?? "http://127.0.0.1:8088/api/v1";
const demoMarker = "BHATIA-HOUSEHOLD-DEMO-V1";
const quoteTimestamp = "2026-10-24T00:00:00Z";
const cookies = new Map();

const profiles = [
  {
    name: "Gaurang (Demo)",
    avatarId: "line-freckles-animated",
    deposits: { india: 1_500_000, global: 25_000 },
    assets: [
      asset("india", "RELIANCE", "Reliance Industries", "INR", 18, 2_650, 2_980, "XNSE"),
      asset("india", "TCS", "Tata Consultancy Services", "INR", 12, 3_550, 4_120, "XNSE"),
      asset("india", "NIFTYBEES", "Nippon India ETF Nifty BeES", "INR", 300, 245, 292, "XNSE"),
      asset("india", "PPFCF", "Parag Parikh Flexi Cap Fund", "INR", 1_250, 72, 89, undefined, {
        sip: { amount: 10_000, months: 10, startMonth: 1 },
      }),
      asset("india", "SGB-DEC31", "Sovereign Gold Bond 2031", "INR", 20, 6_250, 8_150, undefined, {
        instrumentType: "BOND",
        category: "Sovereign Gold Bond",
      }),
      asset("global", "AAPL", "Apple Inc.", "USD", 24, 183, 277, "XNAS"),
      asset("global", "VTI", "Vanguard Total Stock Market ETF", "USD", 18, 252, 329, "XNYS"),
      asset(
        "global",
        "VTSAX",
        "Vanguard Total Stock Market Index Fund",
        "USD",
        30,
        128,
        162,
        undefined,
        {
          category: "US Mutual Fund",
        },
      ),
    ],
  },
  {
    name: "Parent 1 (Demo)",
    avatarId: "line-silver-animated",
    deposits: { india: 2_000_000, global: 10_000 },
    assets: [
      asset("india", "HDFCBANK", "HDFC Bank", "INR", 65, 1_620, 1_980, "XNSE"),
      asset("india", "INFY", "Infosys", "INR", 55, 1_480, 1_640, "XNSE"),
      asset("india", "GOLDBEES", "Nippon India ETF Gold BeES", "INR", 700, 62, 79, "XNSE"),
      asset("india", "SBIBCF", "SBI Bluechip Fund", "INR", 1_500, 78, 99, undefined, {
        sip: { amount: 15_000, months: 10, startMonth: 1 },
      }),
      asset("india", "SGB-JUN31", "Sovereign Gold Bond 2031", "INR", 35, 6_100, 8_150, undefined, {
        instrumentType: "BOND",
        category: "Sovereign Gold Bond",
      }),
      asset("india", "PPF", "Public Provident Fund", "INR", 400_000, 1, 1, undefined, {
        instrumentType: "BOND",
        category: "PPF",
      }),
      asset("global", "MSFT", "Microsoft", "USD", 10, 405, 515, "XNAS"),
      asset("global", "BND", "Vanguard Total Bond Market ETF", "USD", 40, 72, 75, "XNAS", {
        instrumentType: "BOND",
        category: "US ETF",
      }),
    ],
  },
  {
    name: "Parent 2 (Demo)",
    avatarId: "line-curls-animated",
    deposits: { india: 1_200_000, global: 35_000 },
    assets: [
      asset(
        "india",
        "ICICINXT50",
        "ICICI Prudential Nifty Next 50 ETF",
        "INR",
        500,
        58,
        75,
        "XNSE",
      ),
      asset(
        "india",
        "MIRAELM",
        "Mirae Asset Large & Midcap Fund",
        "INR",
        1_100,
        106,
        132,
        undefined,
        {
          sip: { amount: 12_000, months: 10, startMonth: 1 },
        },
      ),
      asset("india", "NPS-TIER1", "NPS Tier I", "INR", 250_000, 1, 1.18, undefined, {
        category: "NPS",
      }),
      asset("india", "FD-2027", "Bank Fixed Deposit 2027", "INR", 300_000, 1, 1.09, undefined, {
        instrumentType: "BOND",
        category: "Fixed Deposit",
      }),
      asset("global", "NVDA", "NVIDIA", "USD", 35, 116, 196, "XNAS"),
      asset("global", "AMZN", "Amazon", "USD", 20, 178, 226, "XNAS"),
      asset("global", "VXUS", "Vanguard Total International Stock ETF", "USD", 70, 61, 73, "XNAS"),
      asset("global", "FXAIX", "Fidelity 500 Index Fund", "USD", 30, 190, 228, undefined, {
        category: "US Mutual Fund",
      }),
    ],
  },
];

function asset(
  account,
  symbol,
  name,
  currency,
  quantity,
  buyPrice,
  currentPrice,
  exchangeMic,
  options = {},
) {
  return {
    account,
    symbol,
    name,
    currency,
    quantity,
    buyPrice,
    currentPrice,
    exchangeMic,
    instrumentType: options.instrumentType ?? "EQUITY",
    category: options.category ?? inferCategory(symbol, currency),
    sip: options.sip,
  };
}

function inferCategory(symbol, currency) {
  if (["NIFTYBEES", "GOLDBEES", "ICICINXT50"].includes(symbol)) return "Indian ETF";
  if (["VTI", "BND", "VXUS"].includes(symbol)) return "US ETF";
  return currency === "INR" ? "Indian stock or mutual fund" : "US stock";
}

async function request(path, { method = "GET", scope, body } = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(cookies.size > 0
        ? { Cookie: [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ") }
        : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(scope ? { "x-wf-profile-scope": scope } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookies = response.headers.getSetCookie?.() ?? [];
  for (const setCookie of setCookies) {
    const [pair] = setCookie.split(";", 1);
    const separator = pair.indexOf("=");
    if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  if (!response.ok) {
    throw new Error(`${method} ${path} failed (${response.status}): ${await response.text()}`);
  }
  if (response.status === 204) return undefined;
  return response.headers.get("content-type")?.includes("application/json")
    ? response.json()
    : response.text();
}

function profileCommand(command, body = {}, scope) {
  return request(`/profiles/${command}`, { method: "POST", body, scope });
}

function activity(accountId, assetId, type, date, currency, values = {}) {
  return {
    id: null,
    accountId,
    asset: assetId ? { id: assetId } : null,
    activityType: type,
    subtype: null,
    activityDate: `${date}T00:00:00Z`,
    quantity: values.quantity === undefined ? null : String(values.quantity),
    unitPrice: values.unitPrice === undefined ? null : String(values.unitPrice),
    currency,
    fee: "0",
    tax: "0",
    amount: values.amount === undefined ? null : String(values.amount),
    status: "POSTED",
    notes: values.notes ?? "Synthetic demo data — not a real investment",
    fxRate: null,
    metadata: JSON.stringify({ demo: true, category: values.category ?? null }),
    needsReview: false,
    sourceSystem: "DEMO",
    sourceRecordId: values.sourceRecordId,
    sourceGroupId: demoMarker,
    idempotencyKey: `${demoMarker}:${values.sourceRecordId}`,
    importRunId: null,
  };
}

async function seedProfile(profile) {
  const state = await profileCommand("get_profile_state");
  const summary = state.profiles.find((candidate) => candidate.name === profile.name);
  const session = await profileCommand("unlock_profile", { profileId: summary.id, proof: null });
  const scope = session.scopeId;
  const existingAccounts = await request("/accounts", { scope });
  if (existingAccounts.length > 0) {
    for (const account of existingAccounts) {
      if (!account.meta?.includes('"demo":true')) continue;
      const name =
        account.name === "India Portfolio"
          ? "INR investments"
          : account.name === "Global Portfolio"
            ? "USD investments"
            : null;
      if (!name) continue;
      await request(`/accounts/${encodeURIComponent(account.id)}`, {
        method: "PUT",
        scope,
        body: {
          name,
          accountType: account.accountType,
          group: "Investments",
          isDefault: account.isDefault,
          isActive: account.isActive,
          platformId: account.platformId,
          accountNumber: account.accountNumber,
          meta: account.meta,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          isArchived: account.isArchived,
          trackingMode: account.trackingMode,
        },
      });
    }
    console.log(`Skipping ${profile.name}: it already has accounts.`);
    return;
  }

  await request("/settings", {
    method: "PUT",
    scope,
    body: {
      language: "en",
      formattingRegion: "IN",
      currencyFormattingRegions: { INR: "IN", USD: "US" },
      baseCurrency: "INR",
      timezone: "Asia/Kolkata",
      onboardingCompleted: true,
      syncEnabled: false,
    },
  });
  await request("/exchange-rates", {
    method: "POST",
    scope,
    body: { fromCurrency: "USD", toCurrency: "INR", rate: 83.5, source: "MANUAL" },
  });

  const india = await request("/accounts", {
    method: "POST",
    scope,
    body: accountPayload("INR investments", "INR", true),
  });
  const global = await request("/accounts", {
    method: "POST",
    scope,
    body: accountPayload("USD investments", "USD", false),
  });
  const accounts = { india, global };
  const activities = [
    activity(india.id, null, "DEPOSIT", "2025-01-02", "INR", {
      amount: profile.deposits.india,
      sourceRecordId: `${profile.name}:deposit:INR`,
    }),
    activity(global.id, null, "DEPOSIT", "2025-01-02", "USD", {
      amount: profile.deposits.global,
      sourceRecordId: `${profile.name}:deposit:USD`,
    }),
  ];

  for (const [index, item] of profile.assets.entries()) {
    const created = await request("/assets", {
      method: "POST",
      scope,
      body: {
        id: null,
        kind: "INVESTMENT",
        name: item.name,
        displayCode: item.symbol,
        isActive: true,
        quoteMode: "MANUAL",
        quoteCcy: item.currency,
        instrumentType: item.instrumentType,
        instrumentSymbol: item.symbol,
        instrumentExchangeMic: item.exchangeMic ?? null,
        providerConfig: null,
        providerId: null,
        providerSymbol: null,
        notes: `Synthetic ${item.category} for the Bhatia Family demo`,
        metadata: { demo: true, category: item.category },
      },
    });
    const accountId = accounts[item.account].id;
    const date = `2025-${String((index % 10) + 1).padStart(2, "0")}-15`;
    activities.push(
      activity(accountId, created.id, "BUY", date, item.currency, {
        quantity: item.quantity,
        unitPrice: item.buyPrice,
        amount: item.quantity * item.buyPrice,
        category: item.category,
        sourceRecordId: `${profile.name}:${item.symbol}:initial`,
      }),
    );
    if (item.sip) {
      const sipQuantity = item.sip.amount / item.buyPrice;
      for (
        let month = item.sip.startMonth;
        month < item.sip.startMonth + item.sip.months;
        month += 1
      ) {
        activities.push(
          activity(
            accountId,
            created.id,
            "BUY",
            `2026-${String(month).padStart(2, "0")}-05`,
            item.currency,
            {
              quantity: sipQuantity.toFixed(6),
              unitPrice: item.buyPrice,
              amount: item.sip.amount,
              category: `${item.category} SIP`,
              notes: `Synthetic monthly SIP of ${item.currency} ${item.sip.amount.toLocaleString("en-IN")}`,
              sourceRecordId: `${profile.name}:${item.symbol}:sip:${month}`,
            },
          ),
        );
      }
    }
    await request(`/market-data/quotes/${encodeURIComponent(created.id)}`, {
      method: "PUT",
      scope,
      body: {
        id: `${created.id}:2026-10-24:MANUAL`,
        assetId: created.id,
        timestamp: quoteTimestamp,
        open: item.currentPrice,
        high: item.currentPrice,
        low: item.currentPrice,
        close: item.currentPrice,
        adjclose: item.currentPrice,
        volume: 0,
        currency: item.currency,
        dataSource: "MANUAL",
        createdAt: quoteTimestamp,
        notes: "Synthetic demo valuation",
      },
    });
  }

  const result = await request("/activities/bulk", {
    method: "POST",
    scope,
    body: { creates: activities, updates: [], deleteIds: [] },
  });
  if (result.errors.length > 0)
    throw new Error(`Activity seed failed: ${JSON.stringify(result.errors)}`);
  console.log(
    `Seeded ${profile.name}: ${profile.assets.length} assets, ${result.created.length} transactions.`,
  );
}

async function seedIncome(profile) {
  const state = await profileCommand("get_profile_state");
  const member = state.profiles.find((candidate) => candidate.name === profile.name);
  if (!member || member.lockEnabled) throw new Error("Demo member is unavailable");
  const session = await profileCommand("unlock_profile", { profileId: member.id, proof: null });
  const scope = session.scopeId;
  const accounts = await request("/accounts", { scope });
  if (accounts.some((account) => !account.meta?.includes('"demo":true'))) {
    throw new Error("Refusing to add sample income to non-demo accounts");
  }
  const existing = await request("/activities/search", { method: "POST", scope, body: { page: 0, pageSize: 1000 } });
  if (existing.meta.totalRowCount > existing.data.length) throw new Error("Demo contains more activities than expected");
  const creates = [];
  for (const currency of ["INR", "USD"]) {
    const holding = existing.data.find((row) => row.activityType === "BUY" && row.currency === currency);
    if (!holding) continue;
    for (const [date, amount] of [["2025-09-15", currency === "INR" ? 1200 : 40], ["2026-03-15", currency === "INR" ? 1600 : 55], ["2026-09-15", currency === "INR" ? 1800 : 60]]) {
      const sourceRecordId = `${profile.name}:income:${currency}:${date}`;
      if (existing.data.some((row) => row.sourceRecordId === sourceRecordId)) continue;
      creates.push(activity(holding.accountId, holding.assetId, "DIVIDEND", date, currency, { amount, sourceRecordId }));
    }
  }
  const bond = existing.data.find((row) => row.activityType === "BUY" && row.assetSymbol.startsWith("SGB"));
  if (bond) {
    const sourceRecordId = `${profile.name}:income:sgb:2026-06-30`;
    if (!existing.data.some((row) => row.sourceRecordId === sourceRecordId)) {
      creates.push(activity(bond.accountId, bond.assetId, "INTEREST", "2026-06-30", "INR", { amount: 1500, sourceRecordId }));
    }
  }
  if (creates.length) {
    const result = await request("/activities/bulk", { method: "POST", scope, body: { creates, updates: [], deleteIds: [] } });
    if (result.errors.length) throw new Error("Sample income could not be fully added");
  }
  console.log(`Sample income ready for ${profile.name}.`);
}

async function seedPlans(profile) {
  const state = await profileCommand("get_profile_state");
  const member = state.profiles.find((candidate) => candidate.name === profile.name);
  if (!member || member.lockEnabled) throw new Error("Demo member is unavailable");
  const session = await profileCommand("unlock_profile", { profileId: member.id, proof: null });
  const scope = session.scopeId;
  const accounts = await request("/accounts", { scope });
  if (!accounts.length || accounts.some((account) => !account.meta?.includes('"demo":true'))) {
    throw new Error("Refusing to add sample plans to non-demo accounts");
  }
  const assets = await request("/assets", { scope });
  const plans = await request("/investment-plans", { scope });
  let changed = false;
  for (const [index, item] of profile.assets.entries()) {
    if (!item.sip) continue;
    const id = `f0110000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    if (plans.some((plan) => plan.id === id)) continue;
    const asset = assets.find((asset) => asset.displayCode === item.symbol);
    const account = accounts.find((account) => account.currency === item.currency);
    if (!asset || !account) throw new Error("Seed the demonstration investments first");
    plans.push({ id, name: `${item.name} · Demo SIP`, accountId: account.id, assetId: asset.id,
      amount: String(item.sip.amount), currency: item.currency, startDate: "2026-01-01",
      endDate: null, dayOfMonth: 5, paused: false });
    changed = true;
  }
  if (changed) await request("/investment-plans", { method: "PUT", scope, body: plans });
  console.log("Demo recurring instructions ready; no new trades created.");
}

function accountPayload(name, currency, isDefault) {
  return {
    id: null,
    name,
    accountType: "SECURITIES",
    group: "Investments",
    currency,
    isDefault,
    isActive: true,
    isArchived: false,
    trackingMode: "TRANSACTIONS",
    platformId: null,
    accountNumber: null,
    meta: JSON.stringify({ demo: true }),
    provider: null,
    providerAccountId: null,
  };
}

async function main() {
  await request("/healthz");
  let state = await profileCommand("get_profile_state");
  const expectedNames = new Set(profiles.map((profile) => profile.name));
  let unknown = state.profiles.filter((profile) => !expectedNames.has(profile.name));
  if (unknown.length === 1 && state.profiles.length === 1 && unknown[0].name === "Personal") {
    const scope = state.session?.scopeId;
    if (!scope) throw new Error("The empty first-run profile could not be opened.");
    const accounts = await request("/accounts", { scope });
    const activities = await request("/activities/search", {
      method: "POST",
      scope,
      body: { page: 0, pageSize: 1 },
    });
    if (accounts.length === 0 && activities.meta.totalRowCount === 0) {
      await profileCommand(
        "update_profile",
        { name: profiles[0].name, avatarId: profiles[0].avatarId },
        scope,
      );
      state = await profileCommand("get_profile_state");
      unknown = [];
    }
  }
  if (unknown.length > 0) {
    throw new Error(
      `Refusing to seed an installation with non-demo profiles: ${unknown.map((profile) => profile.name).join(", ")}`,
    );
  }
  for (const profile of profiles) {
    if (!state.profiles.some((candidate) => candidate.name === profile.name)) {
      await profileCommand("create_profile", {
        name: profile.name,
        avatarId: profile.avatarId,
        password: null,
      });
      state = await profileCommand("get_profile_state");
    }
    if (process.argv.includes("--plans-only")) {
      await seedPlans(profile);
    } else {
      if (!process.argv.includes("--income-only")) await seedProfile(profile);
      await seedIncome(profile);
      await seedPlans(profile);
    }
  }
  const summary = await request("/profiles/household-summary?date=2026-10-24");
  console.log(`Household demo ready with ${summary.members.length} members.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
