// A preset on the existing investment cash ledger, not a quoted security.
const PRODUCT_KEY = "investmentProduct";
const PPF_PRODUCT = "PPF";

export function ppfAccountMeta(meta?: string | null): string {
  let parsed: Record<string, unknown> = {};
  try {
    const value: unknown = JSON.parse(meta ?? "{}");
    if (value && typeof value === "object" && !Array.isArray(value)) {
      parsed = value as Record<string, unknown>;
    }
  } catch {
    // Invalid optional metadata cannot carry preset settings.
  }
  const allocation = parsed.allocation;
  return JSON.stringify({
    ...parsed,
    [PRODUCT_KEY]: PPF_PRODUCT,
    allocation: {
      ...(allocation && typeof allocation === "object" && !Array.isArray(allocation)
        ? allocation
        : {}),
      cashCategoryId: "FIXED_INCOME",
    },
  });
}

export function isPpfAccount(account?: {
  meta?: string | null;
  accountType?: string;
  currency?: string;
  trackingMode?: string;
}): boolean {
  if (
    account?.accountType !== "SECURITIES" ||
    account.currency !== "INR" ||
    account.trackingMode !== "TRANSACTIONS"
  )
    return false;
  try {
    const value: unknown = JSON.parse(account.meta ?? "{}");
    return (
      !!value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>)[PRODUCT_KEY] === PPF_PRODUCT
    );
  } catch {
    return false;
  }
}
