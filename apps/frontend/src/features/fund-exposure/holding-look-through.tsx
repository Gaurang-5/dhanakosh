import {
  getFundExposure,
  previewFundComposition,
  refreshFundComposition,
  removeFundComposition,
  saveFundComposition,
} from "@/adapters";
import type { ExposureContribution, FundComposition } from "@/adapters/shared/fund-exposure";
import type { AccountScope } from "@/lib/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardContent, PrivacyAmount, Skeleton } from "@wealthfolio/ui";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Label } from "@wealthfolio/ui/components/ui/label";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { refreshMissingFundCompositions } from "./automatic-composition-refresh";
import { readFundCompositionFile } from "./fund-composition-file";

interface HoldingLookThroughProps {
  assetId: string;
  currency: string;
  filter: AccountScope;
}

interface ExposureRow {
  identifier: string;
  name: string;
  value: number;
  contributions: ExposureContribution[];
}

function sumValues(rows: ExposureContribution[]): number {
  return rows.reduce((sum, row) => sum + Number(row.value), 0);
}

function compositionSourceLabel(source: string): string {
  return source.toUpperCase() === "YAHOO" ? "YAHOO TOP HOLDINGS (PARTIAL)" : source;
}

export function HoldingLookThrough({ assetId, currency, filter }: HoldingLookThroughProps) {
  const { t } = useTranslation("insights");
  const queryClient = useQueryClient();
  const [source, setSource] = useState("");
  const [asOf, setAsOf] = useState("");
  const [preview, setPreview] = useState<FundComposition | null>(null);

  const query = useQuery({
    queryKey: ["fund-exposure", currency, filter],
    queryFn: () => getFundExposure(currency, filter),
  });

  const mutation = useMutation({
    mutationFn: async (work: () => Promise<unknown>) => work(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["fund-exposure"] });
    },
  });

  const view = query.data;
  const automaticRefreshIds = useMemo(() => {
    const ids = new Set(view?.report.uncoveredFunds ?? []);
    for (const item of view?.snapshots ?? []) {
      if (
        !item.imported &&
        (item.source.toUpperCase() === "YAHOO" ||
          item.source.toUpperCase().includes("TOP HOLDINGS (PARTIAL)"))
      ) {
        ids.add(item.assetId);
      }
    }
    return [...ids];
  }, [view?.report.uncoveredFunds, view?.snapshots]);
  useEffect(() => {
    let active = true;
    void refreshMissingFundCompositions(automaticRefreshIds, refreshFundComposition).then(
      async (refreshed) => {
        if (active && refreshed > 0) {
          await queryClient.invalidateQueries({ queryKey: ["fund-exposure"] });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [automaticRefreshIds, queryClient]);
  const positions = useMemo(
    () => view?.positions.filter((position) => position.assetId === assetId) ?? [],
    [assetId, view?.positions],
  );
  const isFund = positions.some((position) => position.isFund);
  const snapshot = view?.snapshots.find((item) => item.assetId === assetId);
  const selectedIdentifiers = useMemo(
    () => new Set(positions.map((position) => position.identifier)),
    [positions],
  );

  const directRows = useMemo(
    () =>
      view?.report.contributions.filter((part) => !part.viaFund && part.assetId === assetId) ?? [],
    [assetId, view?.report.contributions],
  );
  const indirectRows = useMemo(
    () =>
      view?.report.contributions.filter(
        (part) => part.viaFund && selectedIdentifiers.has(part.identifier),
      ) ?? [],
    [selectedIdentifiers, view?.report.contributions],
  );
  const compositionRows = useMemo(() => {
    if (!isFund) return [];
    const rows = new Map<string, ExposureRow>();
    for (const part of view?.report.contributions ?? []) {
      if (!part.viaFund || part.assetId !== assetId) continue;
      const existing = rows.get(part.identifier) ?? {
        identifier: part.identifier,
        name: part.name,
        value: 0,
        contributions: [],
      };
      existing.value += Number(part.value);
      existing.contributions.push(part);
      rows.set(part.identifier, existing);
    }
    return [...rows.values()].sort((a, b) => b.value - a.value);
  }, [assetId, isFund, view?.report.contributions]);

  if (query.isPending) return <Skeleton className="h-28 w-full" />;
  if (query.isError || !view) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <p className="text-muted-foreground text-sm">{t("exposure.load_error")}</p>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t("exposure.retry")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const directValue = sumValues(directRows);
  const indirectValue = sumValues(indirectRows);
  const fundValue = positions.reduce((sum, position) => sum + Number(position.value), 0);
  const expandedValue = compositionRows.reduce((sum, row) => sum + row.value, 0);
  const remainingValue = Math.max(0, fundValue - expandedValue);

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">
              {isFund ? t("holdings:composition") : t("exposure.title")}
            </h3>
            <p className="text-muted-foreground mt-1 text-sm">
              {isFund ? t("exposure.coverage_note") : t("exposure.description")}
            </p>
            {!isFund &&
              (view.report.uncoveredFunds.length > 0 ||
                view.snapshots.some((item) => !item.imported)) && (
                <p className="text-muted-foreground mt-1 text-sm">{t("exposure.coverage_note")}</p>
              )}
          </div>
          {snapshot && (
            <p className="text-muted-foreground text-xs">
              {compositionSourceLabel(snapshot.source)} ·
              {` ${snapshot.asOf ?? t("exposure.unknown_date")}`}
            </p>
          )}
        </div>

        {isFund ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <ExposureMetric
                label={t("holdings:total_value")}
                value={fundValue}
                currency={currency}
              />
              <ExposureMetric
                label={t("exposure.indirect")}
                value={expandedValue}
                currency={currency}
              />
              <ExposureMetric
                label={t("exposure.unexpanded")}
                value={remainingValue}
                currency={currency}
              />
            </div>

            {compositionRows.length > 0 ? (
              <div className="divide-y rounded-lg border">
                {compositionRows.map((row) => (
                  <div
                    key={row.identifier}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{row.name}</p>
                      <p className="text-muted-foreground truncate text-xs">{row.identifier}</p>
                    </div>
                    <PrivacyAmount value={row.value} currency={currency} className="shrink-0" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">{t("exposure.empty")}</p>
            )}

            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer font-medium">{t("exposure.manage")}</summary>
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate(() => refreshFundComposition(assetId))}
                  >
                    {t("exposure.refresh")}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!snapshot || mutation.isPending}
                    onClick={() => mutation.mutate(() => removeFundComposition(assetId))}
                  >
                    {t("exposure.remove")}
                  </Button>
                </div>
                <p className="text-muted-foreground text-sm">{t("exposure.import_help")}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`composition-source-${assetId}`}>{t("exposure.source")}</Label>
                    <Input
                      id={`composition-source-${assetId}`}
                      value={source}
                      onChange={(event) => setSource(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`composition-date-${assetId}`}>{t("exposure.date")}</Label>
                    <Input
                      id={`composition-date-${assetId}`}
                      type="date"
                      value={asOf}
                      onChange={(event) => setAsOf(event.target.value)}
                    />
                  </div>
                </div>
                <Input
                  aria-label={t("exposure.file")}
                  type="file"
                  accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  disabled={!source || !asOf || mutation.isPending}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    mutation.mutate(async () => {
                      const csvText = await readFundCompositionFile(file, positions[0]?.name ?? "");
                      const result = await previewFundComposition(assetId, source, asOf, csvText);
                      setPreview(result);
                    });
                  }}
                />
                {preview && (
                  <div className="space-y-3">
                    <div className="max-h-64 divide-y overflow-auto rounded-lg border">
                      {preview.constituents.map((row) => (
                        <div
                          key={row.identifier}
                          className="flex justify-between gap-3 px-3 py-2 text-sm"
                        >
                          <span>{row.name}</span>
                          <span className="shrink-0">{row.weightPercent}%</span>
                        </div>
                      ))}
                    </div>
                    <Button
                      disabled={mutation.isPending}
                      onClick={() =>
                        mutation.mutate(() => saveFundComposition(preview), {
                          onSuccess: () => setPreview(null),
                        })
                      }
                    >
                      {t("exposure.save")}
                    </Button>
                  </div>
                )}
                {mutation.isError && (
                  <p role="alert" className="text-destructive text-sm">
                    {mutation.error instanceof Error
                      ? mutation.error.message
                      : String(mutation.error)}
                  </p>
                )}
              </div>
            </details>
          </>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <ExposureMetric
                label={t("exposure.direct")}
                value={directValue}
                currency={currency}
              />
              <ExposureMetric
                label={t("exposure.indirect")}
                value={indirectValue}
                currency={currency}
              />
              <ExposureMetric
                label={t("holdings:total")}
                value={directValue + indirectValue}
                currency={currency}
              />
            </div>
            {indirectRows.length > 0 && (
              <div className="divide-y rounded-lg border">
                {indirectRows.map((part, index) => (
                  <div
                    key={`${part.assetId}:${part.accountId}:${index}`}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                  >
                    <div>
                      <p className="font-medium">{part.viaFund}</p>
                      <p className="text-muted-foreground text-xs">
                        {compositionSourceLabel(part.source ?? "")} ·
                        {` ${part.asOf ?? t("exposure.unknown_date")}`}
                      </p>
                    </div>
                    <PrivacyAmount value={Number(part.value)} currency={currency} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ExposureMetric({
  label,
  value,
  currency,
}: {
  label: string;
  value: number;
  currency: string;
}) {
  return (
    <div className="bg-muted/40 rounded-lg p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <PrivacyAmount value={value} currency={currency} className="mt-1 font-semibold" />
    </div>
  );
}
