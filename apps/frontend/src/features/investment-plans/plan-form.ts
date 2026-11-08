import type { Asset } from "@/lib/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

export const planFormSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    kind: z.enum(["SIP", "SWP", "STP"]),
    accountId: z.string().min(1),
    assetId: z.string().min(1),
    destinationAssetId: z.string(),
    amount: z
      .string()
      .regex(/^\d+(\.\d{1,8})?$/)
      .refine((value) => Number(value) > 0 && Number(value) <= 1e9),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/),
    dayOfMonth: z.coerce.number().int().min(1).max(31),
  })
  .refine((value) => !value.endDate || value.endDate >= value.startDate, { path: ["endDate"] })
  .refine(
    (value) =>
      value.kind !== "STP" ||
      (value.destinationAssetId.length > 0 && value.destinationAssetId !== value.assetId),
    { path: ["destinationAssetId"] },
  );

export type PlanFormValues = z.infer<typeof planFormSchema>;

export function blankPlan(
  today: string,
  account?: { id: string; currency: string },
): PlanFormValues {
  return {
    name: "",
    kind: "SIP",
    accountId: account?.id ?? "",
    assetId: "",
    destinationAssetId: "",
    amount: "",
    currency: account?.currency ?? "INR",
    startDate: today,
    endDate: "",
    dayOfMonth: 1,
  };
}

export function monthlyTotals(
  plans: { kind?: string; amount: string; currency: string; paused: boolean }[],
) {
  const totals = new Map<
    string,
    { kind: "SIP" | "SWP" | "STP"; currency: string; amount: number }
  >();
  for (const plan of plans) {
    if (plan.paused) continue;
    const amount = Number(plan.amount);
    if (!Number.isFinite(amount)) continue;
    const kind = plan.kind === "SWP" || plan.kind === "STP" ? plan.kind : "SIP";
    const key = `${kind}\0${plan.currency}`;
    const current = totals.get(key) ?? { kind, currency: plan.currency, amount: 0 };
    current.amount += amount;
    totals.set(key, current);
  }
  const order = { SIP: 0, SWP: 1, STP: 2 };
  return [...totals.values()].sort(
    (a, b) => order[a.kind] - order[b.kind] || a.currency.localeCompare(b.currency),
  );
}

export function assetIsin(asset: Pick<Asset, "metadata"> | undefined): string | undefined {
  const identifiers = asset?.metadata?.identifiers as { isin?: unknown } | undefined;
  const raw = identifiers?.isin ?? asset?.metadata?.isin;
  if (typeof raw !== "string" || !/^[A-Z]{2}[A-Z0-9]{10}$/i.test(raw.trim())) return undefined;
  return raw.trim().toUpperCase();
}

export function assetLabel(asset: Pick<Asset, "id" | "name" | "displayCode" | "instrumentSymbol">) {
  return asset.name || asset.displayCode || asset.instrumentSymbol || asset.id;
}

export function usePlanForm(today: string) {
  return useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues: blankPlan(today),
  });
}
