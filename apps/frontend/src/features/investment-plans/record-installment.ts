import type { Quote } from "@/lib/types";

const MAX_PRICE_AGE_DAYS = 7;

function calendarDaysBefore(earlier: string, later: string): number {
  const start = Date.parse(`${earlier}T00:00:00Z`);
  const end = Date.parse(`${later}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

/** The saved close on the due date, or the latest close within the previous week. */
export function priceOnOrBefore(
  quotes: Pick<Quote, "timestamp" | "close">[],
  due: string,
): number | null {
  let best: { day: string; close: number } | null = null;
  for (const quote of quotes) {
    const day = quote.timestamp.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > due || !(quote.close > 0)) continue;
    if (!best || day > best.day) best = { day, close: quote.close };
  }
  if (!best || calendarDaysBefore(best.day, due) > MAX_PRICE_AGE_DAYS) return null;
  return best.close;
}

/** Mutual-fund units from a rupee amount and that day's NAV. */
export function unitsForAmount(amount: string, price: number): string {
  const units = Number(amount) / price;
  if (!Number.isFinite(units) || units <= 0) return "";
  return units.toFixed(6).replace(/\.?0+$/, "");
}
