import type { ReactNode } from "react";
import {
  Badge,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  PrivacyAmount,
} from "@wealthfolio/ui";

export type SipBadgeVariant =
  | "secondary"
  | "outline"
  | "info-subtle"
  | "warning-subtle"
  | "success-subtle"
  | "destructive-subtle";

export function SipSummary({
  countLabel,
  count,
  totalLabel,
  totals,
}: {
  countLabel: string;
  count: number;
  totalLabel: string;
  totals: { currency: string; amount: number; label?: string }[];
}) {
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardDescription>{countLabel}</CardDescription>
          <p className="text-2xl font-semibold tabular-nums">{count}</p>
        </div>
        {totals.length > 0 ? (
          <div className="flex flex-col gap-2 sm:items-end">
            {totals.map((total) => (
              <div
                key={`${total.label ?? "total"}-${total.currency}`}
                className="space-y-1 sm:text-end"
              >
                <CardDescription>{total.label ?? totalLabel}</CardDescription>
                <PrivacyAmount
                  className="text-2xl font-semibold tabular-nums"
                  value={total.amount}
                  currency={total.currency}
                />
              </div>
            ))}
          </div>
        ) : null}
      </CardHeader>
    </Card>
  );
}

export function SipPlanCard({
  name,
  kindLabel,
  detail,
  amount,
  currency,
  badgeLabel,
  badgeVariant,
  dueLabel,
  children,
}: {
  name: string;
  kindLabel?: string;
  detail?: string;
  amount: string;
  currency: string;
  badgeLabel: string;
  badgeVariant: SipBadgeVariant;
  dueLabel?: string | null;
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="truncate">{name}</CardTitle>
            {kindLabel ? <Badge variant="outline">{kindLabel}</Badge> : null}
            <Badge variant={badgeVariant}>{badgeLabel}</Badge>
          </div>
          {detail ? <CardDescription className="truncate">{detail}</CardDescription> : null}
          {dueLabel ? <p className="text-sm">{dueLabel}</p> : null}
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <PrivacyAmount
            className="text-lg font-semibold tabular-nums"
            value={Number(amount)}
            currency={currency}
          />
          {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
        </div>
      </CardHeader>
    </Card>
  );
}
