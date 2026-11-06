import type { ActivityDetails } from "@/lib/types";
import { render, screen } from "@testing-library/react";
import { FormattingProvider } from "@wealthfolio/ui";
import { describe, expect, it, vi } from "vitest";
import { ActivityDetailSheet, ActivityReviewReasons } from "./activity-detail-sheet";

vi.mock("@/hooks/use-balance-privacy", () => ({
  useBalancePrivacy: () => ({ isBalanceHidden: false }),
}));

describe("ActivityReviewReasons", () => {
  it("shows provider-supplied reasons for an activity needing review", () => {
    render(
      <ActivityReviewReasons
        activity={{
          needsReview: true,
          metadata: {
            mapping_reasons: ["Provider could not supply a market value"],
          },
        }}
      />,
    );

    expect(screen.getByText("Needs Review")).toBeInTheDocument();
    expect(screen.getByText("Provider could not supply a market value")).toBeInTheDocument();
  });

  it("does not show stale provider reasons after review is complete", () => {
    render(
      <ActivityReviewReasons
        activity={{
          needsReview: false,
          metadata: { mapping_reasons: ["Previously required review"] },
        }}
      />,
    );

    expect(screen.queryByText("Previously required review")).not.toBeInTheDocument();
  });

  it("shows what to check when a flagged activity has no provider reason", () => {
    render(<ActivityReviewReasons activity={{ needsReview: true, metadata: {} }} />);

    expect(
      screen.getByText("Confirm each transaction's asset, type, and final amount."),
    ).toBeInTheDocument();
  });

  it("explains a flagged trade total using its recorded and calculated amounts", () => {
    render(
      <ActivityReviewReasons
        activity={{
          needsReview: true,
          metadata: {},
          activityType: "BUY",
          quantity: "3.334",
          unitPrice: "2249.694",
          amount: "7499.63",
          fee: null,
          tax: null,
          currency: "INR",
        }}
      />,
    );

    expect(screen.getByText(/Recorded amount.*differs from.*calculated/)).toBeInTheDocument();
  });
});

describe("ActivityDetailSheet", () => {
  it("shows an option's strike in its quote currency, not the activity currency", () => {
    const activity = {
      id: "option-buy",
      activityType: "BUY",
      date: "2026-01-02T12:00:00Z",
      quantity: "1",
      unitPrice: "7",
      amount: "700",
      currency: "CAD",
      assetSymbol: "AAPL260619C00150000",
      assetQuoteCcy: "USD",
      instrumentType: "OPTION",
    } as unknown as ActivityDetails;

    render(
      <FormattingProvider locale="US">
        <ActivityDetailSheet activity={activity} open onOpenChange={vi.fn()} />
      </FormattingProvider>,
    );

    expect(screen.getByText("Jun 19 $150.00 CALL")).toBeInTheDocument();
    expect(screen.getByText("$150.00")).toBeInTheDocument();
    expect(screen.queryByText("CA$150.00")).not.toBeInTheDocument();
  });
});
