import type { PortfolioDayChange } from "@/lib/portfolio-day-change";
import { GainAmount, GainPercent, Skeleton } from "@wealthfolio/ui";

interface PortfolioDayChangeTextProps {
  dayChange: PortfolioDayChange;
  currency: string;
  label: string;
  description?: string;
  isLoading?: boolean;
  /** Keep the label visible when today's move cannot be calculated. */
  showWhenEmpty?: boolean;
}

export function PortfolioDayChangeText({
  dayChange,
  currency,
  label,
  description,
  isLoading = false,
  showWhenEmpty = false,
}: PortfolioDayChangeTextProps) {
  const hasChange = dayChange.amount != null && dayChange.percent != null;

  if (isLoading) {
    return <Skeleton className="h-4 w-36" data-testid="portfolio-day-change" />;
  }

  if (!hasChange) {
    if (!showWhenEmpty) return null;
    return (
      <p
        className="text-muted-foreground text-sm"
        data-testid="portfolio-day-change"
        title={description}
      >
        {label} —
      </p>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm"
      data-testid="portfolio-day-change"
      title={description}
    >
      <GainAmount
        value={dayChange.amount ?? 0}
        currency={currency}
        displayCurrency={false}
        className="flex-row items-center text-start text-sm font-medium"
      />
      <GainPercent value={dayChange.percent ?? 0} className="text-sm font-medium" />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
