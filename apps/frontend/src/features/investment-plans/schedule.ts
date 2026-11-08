import type { InvestmentPlan } from "@/adapters/shared/investment-plans";
import type { ActivityDetails } from "@/lib/types";

export type PlanKind = "SIP" | "SWP" | "STP";

export function planKind(plan: Pick<InvestmentPlan, "kind">): PlanKind {
  return plan.kind === "SWP" || plan.kind === "STP" ? plan.kind : "SIP";
}

export function sipInstallmentMarker(
  plan: Pick<InvestmentPlan, "id" | "kind">,
  month: string,
): string {
  return `${planKind(plan)} ${plan.id} ${month}`;
}

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

function purchaseCash(activity: ActivityDetails, currency: string): bigint | null {
  const recorded = minorUnits(activity.amount, currency);
  if (recorded !== null && recorded > 0n) return recorded;
  const quantity = activity.quantity?.trim();
  const price = activity.unitPrice?.trim();
  if (!quantity || !price || !/^\d+(\.\d+)?$/.test(quantity) || !/^\d+(\.\d+)?$/.test(price)) {
    return null;
  }
  const value = Number(quantity) * Number(price);
  if (!Number.isFinite(value) || value <= 0) return null;
  return minorUnits(value.toFixed(8), currency);
}

function sameAsset(
  activity: ActivityDetails,
  assetId: string,
  isinByAssetId?: ReadonlyMap<string, string>,
): boolean {
  if (activity.assetId === assetId) return true;
  const planned = isinByAssetId?.get(assetId);
  const traded = isinByAssetId?.get(activity.assetId);
  return Boolean(planned && traded && planned === traded);
}

export interface PlanLeg {
  assetId: string;
  activityType: "BUY" | "SELL";
  idempotencyKey: string;
  sourceGroupId?: string;
}

function hasLeg(
  matches: ActivityDetails[],
  assetId: string,
  activityType: "BUY" | "SELL",
  isinByAssetId?: ReadonlyMap<string, string>,
): boolean {
  return matches.some(
    (activity) =>
      activity.activityType === activityType && sameAsset(activity, assetId, isinByAssetId),
  );
}

export function purchaseCandidates(
  plan: InvestmentPlan,
  month: string,
  activities: ActivityDetails[],
  timezone = "UTC",
  isinByAssetId?: ReadonlyMap<string, string>,
): ActivityDetails[] {
  if (!installmentDate(plan, month)) return [];
  const plannedAmount = minorUnits(plan.amount, plan.currency);
  if (plannedAmount === null) return [];
  // Imported fund units and NAV are rounded independently, so the recorded
  // purchase can differ slightly from the standing instruction amount.
  const tolerance = plannedAmount / 10000n > 100n ? 100n : plannedAmount / 10000n;
  const kind = planKind(plan);
  const marker = sipInstallmentMarker(plan, month);
  const formatter = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  });
  return activities.filter((activity) => {
    const date = new Date(activity.date);
    if (!Number.isFinite(date.getTime())) return false;
    const parts = formatter.formatToParts(date);
    const activityMonth = `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
    const source =
      activity.activityType === (kind === "SIP" ? "BUY" : "SELL") &&
      sameAsset(activity, plan.assetId, isinByAssetId);
    const destination =
      kind === "STP" &&
      Boolean(plan.destinationAssetId) &&
      activity.activityType === "BUY" &&
      sameAsset(activity, plan.destinationAssetId ?? "", isinByAssetId);
    if (
      (!source && !destination) ||
      activity.accountId !== plan.accountId ||
      activity.currency !== plan.currency ||
      activityMonth !== month
    ) {
      return false;
    }
    if (activity.comment?.includes(marker)) return true;
    const amount = purchaseCash(activity, plan.currency);
    return (
      amount !== null && amount >= plannedAmount - tolerance && amount <= plannedAmount + tolerance
    );
  });
}

export function installmentSettled(
  plan: InvestmentPlan,
  matches: ActivityDetails[],
  isinByAssetId?: ReadonlyMap<string, string>,
): boolean {
  const kind = planKind(plan);
  const source = hasLeg(matches, plan.assetId, kind === "SIP" ? "BUY" : "SELL", isinByAssetId);
  if (kind !== "STP") return source;
  return (
    source &&
    Boolean(plan.destinationAssetId) &&
    hasLeg(matches, plan.destinationAssetId ?? "", "BUY", isinByAssetId)
  );
}

export function missingLegs(
  plan: InvestmentPlan,
  month: string,
  matches: ActivityDetails[],
  isinByAssetId?: ReadonlyMap<string, string>,
): PlanLeg[] {
  const kind = planKind(plan);
  const legs: PlanLeg[] = [];
  const sourceType = kind === "SIP" ? "BUY" : "SELL";
  if (!hasLeg(matches, plan.assetId, sourceType, isinByAssetId)) {
    legs.push({
      assetId: plan.assetId,
      activityType: sourceType,
      idempotencyKey:
        kind === "STP"
          ? `stp:${plan.id}:${month}:sell`
          : `${kind.toLowerCase()}:${plan.id}:${month}`,
      sourceGroupId: kind === "STP" ? `stp:${plan.id}:${month}` : undefined,
    });
  }
  if (kind === "STP" && plan.destinationAssetId) {
    if (!hasLeg(matches, plan.destinationAssetId, "BUY", isinByAssetId)) {
      legs.push({
        assetId: plan.destinationAssetId,
        activityType: "BUY",
        idempotencyKey: `stp:${plan.id}:${month}:buy`,
        sourceGroupId: `stp:${plan.id}:${month}`,
      });
    }
  }
  return legs;
}
