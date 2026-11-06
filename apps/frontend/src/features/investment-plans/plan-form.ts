import type { Asset } from "@/lib/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

export const planFormSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    accountId: z.string().min(1),
    assetId: z.string().min(1),
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
  .refine((value) => !value.endDate || value.endDate >= value.startDate, { path: ["endDate"] });

export type PlanFormValues = z.infer<typeof planFormSchema>;

export function blankPlan(
  today: string,
  account?: { id: string; currency: string },
): PlanFormValues {
  return {
    name: "",
    accountId: account?.id ?? "",
    assetId: "",
    amount: "",
    currency: account?.currency ?? "INR",
    startDate: today,
    endDate: "",
    dayOfMonth: 1,
  };
}

export function monthlyTotals(plans: { amount: string; currency: string; paused: boolean }[]) {
  const totals = new Map<string, number>();
  for (const plan of plans) {
    if (plan.paused) continue;
    const amount = Number(plan.amount);
    if (!Number.isFinite(amount)) continue;
    totals.set(plan.currency, (totals.get(plan.currency) ?? 0) + amount);
  }
  return [...totals.entries()].map(([currency, amount]) => ({ currency, amount }));
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
