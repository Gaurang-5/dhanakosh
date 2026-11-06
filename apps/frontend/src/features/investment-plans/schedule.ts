import type { InvestmentPlan } from "@/adapters/shared/investment-plans";
import type { ActivityDetails } from "@/lib/types";
export function installmentDate(plan: InvestmentPlan, month: string): string | null {
  if (plan.paused || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, m] = month.split("-").map(Number);
  const day = Math.min(plan.dayOfMonth, new Date(Date.UTC(year, m, 0)).getUTCDate());
  const date = `${month}-${String(day).padStart(2, "0")}`;
  return date < plan.startDate || (plan.endDate && date > plan.endDate) ? null : date;
}
function minorUnits(value: string | null | undefined, currency: string): bigint | null {
  if (!value || !/^\+?\d+(\.\d+)?$/.test(value)) return null;
  const digits =
    new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  const [integer, rawFraction = ""] = value.replace(/^\+/, "").split(".");
  const fraction = rawFraction.padEnd(digits + 1, "0");
  const whole = BigInt(integer) * 10n ** BigInt(digits);
  const cents = BigInt(fraction.slice(0, digits) || "0");
  return whole + cents + (Number(fraction[digits]) >= 5 ? 1n : 0n);
}
export function purchaseCandidates(
  plan: InvestmentPlan,
  month: string,
  activities: ActivityDetails[],
  timezone = "UTC",
): ActivityDetails[] {
  if (!installmentDate(plan, month)) return [];
  const plannedAmount = minorUnits(plan.amount, plan.currency);
  if (plannedAmount === null) return [];
  // Imported fund units and NAV are rounded independently, so the recorded
  // purchase can differ slightly from the standing instruction amount.
  const tolerance = plannedAmount / 10000n > 100n ? 100n : plannedAmount / 10000n;
  const formatter = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  });
  return activities.filter((a) => {
    const date = new Date(a.date);
    if (!Number.isFinite(date.getTime())) return false;
    const parts = formatter.formatToParts(date);
    const activityMonth = `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}`;
    const amount = minorUnits(a.amount, plan.currency);
    return (
      a.activityType === "BUY" &&
      a.accountId === plan.accountId &&
      a.assetId === plan.assetId &&
      a.currency === plan.currency &&
      activityMonth === month &&
      amount !== null &&
      amount >= plannedAmount - tolerance &&
      amount <= plannedAmount + tolerance
    );
  });
}
