import { getFundExposure, refreshFundComposition } from "@/adapters";
import type { ExposureView } from "@/adapters/shared/fund-exposure";
import { TickerAvatar } from "@/components/ticker-avatar";
import { refreshMissingFundCompositions } from "@/features/fund-exposure/automatic-composition-refresh";
import {
  aggregateTotalExposure,
  exposureSecurityIdentity,
  type ExposureFundLine,
  type TotalExposureRow,
} from "@/features/fund-exposure/total-exposure-model";
import { getInstrumentAvatarIdentity } from "@/lib/instrument-display";
import { usesLegacyPreferences } from "@/features/profiles/session";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { profilePreferenceKey } from "@/hooks/use-persistent-state";
import type { AccountScope } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { AmountDisplay, Button, Input, Skeleton } from "@wealthfolio/ui";
import { Card } from "@wealthfolio/ui/components/ui/card";
import { DataTable } from "@wealthfolio/ui/components/ui/data-table";
import { DataTableColumnHeader } from "@wealthfolio/ui/components/ui/data-table/data-table-column-header";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { TableCell, TableRow } from "@wealthfolio/ui/components/ui/table";
import type { TFunction } from "i18next";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

function refreshCandidates(view?: ExposureView): string[] {
  const ids = new Set(view?.report.uncoveredFunds ?? []);
  for (const snapshot of view?.snapshots ?? []) {
    if (
      !snapshot.imported &&
      (snapshot.source.toUpperCase() === "YAHOO" ||
        snapshot.source.toUpperCase().includes("TOP HOLDINGS (PARTIAL)"))
    ) {
      ids.add(snapshot.assetId);
    }
  }
  return [...ids];
}

interface ExposureExpansion {
  isExpanded: (id: string) => boolean;
  toggle: (id: string) => void;
}

const ExposureExpansionContext = createContext<ExposureExpansion>({
  isExpanded: () => false,
  toggle: () => undefined,
});

function exposureSubtitle(row: TotalExposureRow, t: TFunction): string | null {
  const identity = exposureSecurityIdentity(row.identifier, row.name);
  const fundSources = row.fundCount > 0 ? t("fund_sources", { count: row.fundCount }) : null;
  return [identity.secondary, fundSources].filter(Boolean).join(" · ") || null;
}

function ExposureAmount({
  value,
  currency,
  isHidden,
}: {
  value: number;
  currency: string;
  isHidden: boolean;
}) {
  return (
    <div className="flex min-h-10 flex-col items-end justify-center px-4">
      <AmountDisplay value={value} currency={currency} isHidden={isHidden} />
      <div className="text-muted-foreground text-xs">{currency}</div>
    </div>
  );
}

function SecurityCell({ row }: { row: TotalExposureRow }) {
  const { t } = useTranslation("holdings");
  const navigate = useNavigate();
  const expansion = useContext(ExposureExpansionContext);
  const identity = exposureSecurityIdentity(row.identifier, row.name);
  const subtitle = exposureSubtitle(row, t);
  const expanded = row.fundCount > 0 && expansion.isExpanded(row.identifier);
  const openHolding = (event: { stopPropagation: () => void }) => {
    if (!row.directAssetId) return;
    event.stopPropagation();
    navigate(`/holdings/${encodeURIComponent(row.directAssetId)}`);
  };

  return (
    <div className="flex items-center">
      {row.fundCount > 0 ? (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground me-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md"
          aria-expanded={expanded}
          aria-label={t("fund_sources", { count: row.fundCount })}
          onClick={(event) => {
            event.stopPropagation();
            expansion.toggle(row.identifier);
          }}
        >
          <Icons.ChevronRight
            aria-hidden
            className={cn("size-4 transition-transform", expanded ? "rotate-90" : "rtl:rotate-180")}
          />
        </button>
      ) : (
        <span className="me-1 inline-block size-8 shrink-0" aria-hidden />
      )}
      <div className="flex min-w-0 items-center">
        <div
          className={row.directAssetId ? "cursor-pointer" : undefined}
          onClick={row.directAssetId ? openHolding : undefined}
        >
          <TickerAvatar
            symbol={identity.logoSymbol}
            exchangeMic={identity.exchangeMic}
            assetId={row.directAssetId}
            fallbackName={identity.primary === identity.logoSymbol ? undefined : row.name}
            className="me-2 h-8 w-8"
          />
        </div>
        <div className="flex min-w-0 flex-col">
          <bdi
            className={cn("font-medium", row.directAssetId && "cursor-pointer")}
            onClick={row.directAssetId ? openHolding : undefined}
          >
            {identity.primary}
          </bdi>
          {subtitle ? (
            <span dir="auto" className="text-muted-foreground line-clamp-1 text-xs rtl:text-right">
              {subtitle}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FundLineAvatar({ fund }: { fund: ExposureFundLine }) {
  const identity = getInstrumentAvatarIdentity({
    name: fund.name,
    instrumentType: "MUTUAL_FUND",
  });
  return (
    <TickerAvatar
      symbol={identity.symbol}
      exchangeMic={identity.exchangeMic}
      instrumentType="MUTUAL_FUND"
      assetId={fund.assetId}
      className="me-2 h-8 w-8"
    />
  );
}

function ExposureMobileList({
  rows,
  currency,
  isHidden,
  uncoveredCount,
}: {
  rows: TotalExposureRow[];
  currency: string;
  isHidden: boolean;
  uncoveredCount: number;
}) {
  const { t } = useTranslation("holdings");
  const navigate = useNavigate();
  const expansion = useContext(ExposureExpansionContext);
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (!needle) return true;
        return (
          row.name.toLowerCase().includes(needle) || row.identifier.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [query, rows]);

  return (
    <div className="min-w-0 space-y-3">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("search_placeholder")}
        className="bg-secondary/30 h-10 rounded-full border-none"
      />
      {uncoveredCount > 0 ? (
        <p className="text-muted-foreground text-xs">
          {t("funds_pending_expansion", { count: uncoveredCount })}
        </p>
      ) : null}
      {visible.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed px-4 text-center">
          <p className="text-muted-foreground text-sm">{t("no_positions_found")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((row) => {
            const identity = exposureSecurityIdentity(row.identifier, row.name);
            const subtitle = exposureSubtitle(row, t);
            const expanded = row.fundCount > 0 && expansion.isExpanded(row.identifier);
            const openHolding = (event: { stopPropagation: () => void }) => {
              if (!row.directAssetId) return;
              event.stopPropagation();
              navigate(`/holdings/${encodeURIComponent(row.directAssetId)}`);
            };
            return (
              <Card
                key={row.identifier}
                className={cn("min-w-0 p-3", row.fundCount > 0 && "cursor-pointer")}
                onClick={() => {
                  if (row.fundCount > 0) expansion.toggle(row.identifier);
                }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  {row.fundCount > 0 ? (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground inline-flex size-8 shrink-0 items-center justify-center rounded-md"
                      aria-expanded={expanded}
                      aria-label={t("fund_sources", { count: row.fundCount })}
                      onClick={(event) => {
                        event.stopPropagation();
                        expansion.toggle(row.identifier);
                      }}
                    >
                      <Icons.ChevronRight
                        aria-hidden
                        className={cn(
                          "size-4 transition-transform",
                          expanded ? "rotate-90" : "rtl:rotate-180",
                        )}
                      />
                    </button>
                  ) : (
                    <span className="inline-block size-8 shrink-0" aria-hidden />
                  )}
                  <TickerAvatar
                    symbol={identity.logoSymbol}
                    exchangeMic={identity.exchangeMic}
                    assetId={row.directAssetId}
                    fallbackName={identity.primary === identity.logoSymbol ? undefined : row.name}
                    className="size-10 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <bdi
                      className={cn(
                        "block truncate font-medium",
                        row.directAssetId && "cursor-pointer",
                      )}
                      onClick={row.directAssetId ? openHolding : undefined}
                    >
                      {identity.primary}
                    </bdi>
                    {subtitle ? (
                      <span dir="auto" className="text-muted-foreground block truncate text-xs">
                        {subtitle}
                      </span>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-end">
                    <AmountDisplay
                      value={row.totalValue}
                      currency={currency}
                      isHidden={isHidden}
                      className="font-medium"
                    />
                    <div className="text-muted-foreground text-xs">{currency}</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 ps-10">
                  <div className="min-w-0">
                    <p className="text-muted-foreground text-xs">{t("direct")}</p>
                    <AmountDisplay
                      value={row.directValue}
                      currency={currency}
                      isHidden={isHidden}
                      className="text-sm"
                    />
                  </div>
                  <div className="min-w-0 text-end">
                    <p className="text-muted-foreground text-xs">{t("through_funds")}</p>
                    <AmountDisplay
                      value={row.fundValue}
                      currency={currency}
                      isHidden={isHidden}
                      className="text-sm"
                    />
                  </div>
                </div>
                {expanded ? (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    {row.funds.map((fund) => (
                      <div
                        key={`${row.identifier}:${fund.assetId}:${fund.name}`}
                        className="flex min-w-0 items-center gap-2 ps-10"
                      >
                        <FundLineAvatar fund={fund} />
                        <span dir="auto" className="min-w-0 flex-1 truncate text-sm">
                          {fund.name}
                        </span>
                        <AmountDisplay
                          value={fund.value}
                          currency={currency}
                          isHidden={isHidden}
                          className="shrink-0 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function exposureColumns(
  t: TFunction,
  currency: string,
  isHidden: boolean,
): ColumnDef<TotalExposureRow>[] {
  return [
    {
      id: "security",
      accessorFn: (row) => `${row.name} ${row.identifier}`,
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("security")} />,
      meta: { label: t("security") },
      cell: ({ row }) => <SecurityCell row={row.original} />,
      sortingFn: (rowA, rowB) =>
        exposureSecurityIdentity(
          rowA.original.identifier,
          rowA.original.name,
        ).primary.localeCompare(
          exposureSecurityIdentity(rowB.original.identifier, rowB.original.name).primary,
        ),
    },
    {
      id: "direct",
      accessorFn: (row) => row.directValue,
      header: ({ column }) => (
        <DataTableColumnHeader className="justify-end" column={column} title={t("direct")} />
      ),
      meta: { label: t("direct") },
      cell: ({ row }) => (
        <ExposureAmount value={row.original.directValue} currency={currency} isHidden={isHidden} />
      ),
    },
    {
      id: "throughFunds",
      accessorFn: (row) => row.fundValue,
      header: ({ column }) => (
        <DataTableColumnHeader className="justify-end" column={column} title={t("through_funds")} />
      ),
      meta: { label: t("through_funds") },
      cell: ({ row }) => (
        <ExposureAmount value={row.original.fundValue} currency={currency} isHidden={isHidden} />
      ),
    },
    {
      id: "total",
      accessorFn: (row) => row.totalValue,
      header: ({ column }) => (
        <DataTableColumnHeader
          className="justify-end"
          column={column}
          title={t("total_exposure")}
        />
      ),
      meta: { label: t("total_exposure") },
      cell: ({ row }) => (
        <ExposureAmount value={row.original.totalValue} currency={currency} isHidden={isHidden} />
      ),
    },
  ];
}

export function TotalExposureHoldings({
  currency,
  filter,
}: {
  currency: string;
  filter: AccountScope;
}) {
  const { t } = useTranslation("holdings");
  const mobile = useIsMobileViewport();
  const { isBalanceHidden } = useBalancePrivacy();
  const queryClient = useQueryClient();
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const expansion = useMemo<ExposureExpansion>(
    () => ({
      isExpanded: (id) => expandedIds.has(id),
      toggle: toggleExpanded,
    }),
    [expandedIds, toggleExpanded],
  );
  const columns = useMemo(
    () => exposureColumns(t, currency, isBalanceHidden),
    [t, currency, isBalanceHidden],
  );
  const renderExpandedRows = useCallback(
    (row: TotalExposureRow) =>
      row.funds.map((fund) => (
        <TableRow key={`${row.identifier}:${fund.name}`} className="bg-muted/20">
          <TableCell>
            <div className="flex items-center">
              <span className="me-1 inline-block size-8 shrink-0" aria-hidden />
              <FundLineAvatar fund={fund} />
              <span dir="auto" className="text-sm">
                {fund.name}
              </span>
            </div>
          </TableCell>
          <TableCell />
          <TableCell>
            <ExposureAmount value={fund.value} currency={currency} isHidden={isBalanceHidden} />
          </TableCell>
          <TableCell />
        </TableRow>
      )),
    [currency, isBalanceHidden],
  );
  const query = useQuery({
    queryKey: ["fund-exposure", currency, filter],
    queryFn: () => getFundExposure(currency, filter),
  });
  const candidates = useMemo(() => refreshCandidates(query.data), [query.data]);

  useEffect(() => {
    let active = true;
    void refreshMissingFundCompositions(candidates, refreshFundComposition).then(
      async (refreshed) => {
        if (active && refreshed > 0) {
          await queryClient.invalidateQueries({ queryKey: ["fund-exposure"] });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [candidates, queryClient]);

  if (query.isPending) {
    return (
      <div className="space-y-4 pt-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border p-4">
        <p className="text-muted-foreground text-sm">{t("exposure_view_load_error")}</p>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          {t("retry")}
        </Button>
      </div>
    );
  }

  const rows = aggregateTotalExposure(query.data.report.contributions);
  const uncoveredCount = query.data.report.uncoveredFunds.length;

  return (
    <div
      className={cn(mobile ? "min-w-0" : "flex h-full flex-col")}
      aria-label={t("total_exposure")}
    >
      <ExposureExpansionContext.Provider value={expansion}>
        {mobile ? (
          <ExposureMobileList
            rows={rows}
            currency={currency}
            isHidden={isBalanceHidden}
            uncoveredCount={uncoveredCount}
          />
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            searchBy="security"
            storageKey={profilePreferenceKey("total-exposure-table")}
            fallbackStorageKey={usesLegacyPreferences() ? "total-exposure-table" : undefined}
            defaultSorting={[{ id: "total", desc: true }]}
            scrollable
            isRowExpanded={(row) => expandedIds.has(row.identifier)}
            renderExpandedRows={renderExpandedRows}
            onRowClick={(row) => {
              if (row.fundCount > 0) toggleExpanded(row.identifier);
            }}
            rowClassName={(row) => (row.fundCount > 0 ? "cursor-pointer" : undefined)}
            toolbarActions={
              uncoveredCount > 0 ? (
                <p className="text-muted-foreground text-xs">
                  {t("funds_pending_expansion", { count: uncoveredCount })}
                </p>
              ) : undefined
            }
          />
        )}
      </ExposureExpansionContext.Provider>
    </div>
  );
}
