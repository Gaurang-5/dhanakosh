import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  getFundExposure,
  previewFundComposition,
  saveFundComposition,
  refreshFundComposition,
  removeFundComposition,
} from "@/adapters";
import type {
  FundComposition,
  ExposureContribution,
  MemberExposure,
} from "@/adapters/shared/fund-exposure";
import { useHouseholdReport } from "@/features/household/household-report-context";
import { useHouseholdScope } from "@/features/household/household-scope";
import { getHouseholdExposure } from "@/features/household/household-api";
import { useSettingsContext } from "@/lib/settings-provider";
import type { AccountScope } from "@/lib/types";
import { Button, Card, CardContent, PrivacyAmount, Skeleton } from "@wealthfolio/ui";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Label } from "@wealthfolio/ui/components/ui/label";
import { readFundCompositionFile } from "./fund-composition-file";

export function FundExposurePage({ filter }: { filter: AccountScope }) {
  const { t } = useTranslation("insights");
  const family = useHouseholdReport();
  const scope = useHouseholdScope();
  const { settings } = useSettingsContext();
  const currency = settings?.baseCurrency ?? "USD";
  const ids = scope?.memberIds ?? [];
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [assetId, setAssetId] = useState("");
  const [source, setSource] = useState("");
  const [asOf, setAsOf] = useState("");
  const [preview, setPreview] = useState<FundComposition | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["fund-exposure", !!family, ids, currency, filter],
    queryFn: async (): Promise<MemberExposure[]> =>
      family
        ? getHouseholdExposure(ids, currency)
        : [{ memberId: "", memberName: "", view: await getFundExposure(currency, filter) }],
    enabled: !family || ids.length > 0,
  });
  const members = useMemo(() => query.data ?? [], [query.data]);
  const assets = useMemo(
    () => [
      ...new Map(members.flatMap((m) => m.view.positions).map((p) => [p.assetId, p])).values(),
    ],
    [members],
  );
  const rows = useMemo(() => {
    const result = new Map<
      string,
      {
        identifier: string;
        name: string;
        direct: number;
        indirect: number;
        contributions: (ExposureContribution & { memberName: string })[];
      }
    >();
    for (const member of members)
      for (const part of member.view.report.contributions) {
        const row = result.get(part.identifier) ?? {
          identifier: part.identifier,
          name: part.name,
          direct: 0,
          indirect: 0,
          contributions: [],
        };
        if (part.viaFund) row.indirect += Number(part.value);
        else row.direct += Number(part.value);
        row.contributions.push({ ...part, memberName: member.memberName });
        result.set(part.identifier, row);
      }
    return [...result.values()]
      .filter((r) => `${r.name} ${r.identifier}`.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.direct + b.indirect - a.direct - a.indirect);
  }, [members, search]);
  async function act(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await client.invalidateQueries({ queryKey: ["fund-exposure"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  if (query.isPending) return <Skeleton className="h-64" />;
  if (query.isError)
    return (
      <div role="alert">
        <p>{t("exposure.load_error")}</p>
        <Button onClick={() => void query.refetch()}>{t("exposure.retry")}</Button>
      </div>
    );
  const unexpanded = members.reduce((sum, m) => sum + Number(m.view.report.unexpandedValue), 0);
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">{t("exposure.title")}</h2>
        <p className="text-muted-foreground mt-2 text-sm">{t("exposure.description")}</p>
      </div>
      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="font-medium">
            {t("exposure.unexpanded")} <PrivacyAmount value={unexpanded} currency={currency} />
          </p>
          <p className="text-muted-foreground text-sm">{t("exposure.coverage_note")}</p>
        </CardContent>
      </Card>
      {family ? (
        <div className="flex flex-wrap gap-2">
          {members.map((member) => (
            <Button
              key={member.memberId}
              variant="outline"
              onClick={() =>
                scope?.selectMember(member.memberId, "/insights?tab=exposure&memberEdit=1")
              }
            >
              {t("exposure.manage_member", { name: member.memberName })}
            </Button>
          ))}
        </div>
      ) : (
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer font-medium">{t("exposure.manage")}</summary>
          <div className="mt-4 space-y-4">
            <Label htmlFor="exposure-fund">{t("exposure.fund")}</Label>
            <select
              id="exposure-fund"
              className="bg-background w-full rounded-md border p-2"
              value={assetId}
              onChange={(e) => {
                setAssetId(e.target.value);
                setPreview(null);
              }}
            >
              <option value="">{t("exposure.choose_fund")}</option>
              {assets.map((asset) => (
                <option value={asset.assetId} key={asset.assetId}>
                  {asset.name}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!assetId || busy}
                variant="outline"
                onClick={() => void act(() => refreshFundComposition(assetId))}
              >
                {t("exposure.refresh")}
              </Button>
              <Button
                disabled={
                  !assetId || busy || !members[0]?.view.snapshots.some((s) => s.assetId === assetId)
                }
                variant="outline"
                onClick={() => void act(() => removeFundComposition(assetId))}
              >
                {t("exposure.remove")}
              </Button>
            </div>
            <p className="text-muted-foreground text-sm">{t("exposure.import_help")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="exposure-source">{t("exposure.source")}</Label>
                <Input
                  id="exposure-source"
                  value={source}
                  onChange={(e) => {
                    setSource(e.target.value);
                    setPreview(null);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exposure-date">{t("exposure.date")}</Label>
                <Input
                  id="exposure-date"
                  type="date"
                  value={asOf}
                  onChange={(e) => {
                    setAsOf(e.target.value);
                    setPreview(null);
                  }}
                />
              </div>
            </div>
            <Input
              aria-label={t("exposure.file")}
              type="file"
              accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={!assetId || !source || !asOf || busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                setPreview(null);
                if (!file) return;
                void act(async () => {
                  const schemeName = assets.find((asset) => asset.assetId === assetId)?.name ?? "";
                  const csvText = await readFundCompositionFile(file, schemeName);
                  setPreview(await previewFundComposition(assetId, source, asOf, csvText));
                });
              }}
            />
            {preview && (
              <div className="space-y-3">
                <div className="max-h-64 overflow-auto rounded-md border p-3">
                  {preview.constituents.map((row) => (
                    <div className="flex justify-between gap-3 py-1 text-sm" key={row.identifier}>
                      <span>
                        {row.name} · {row.identifier}
                      </span>
                      <span>{row.weightPercent}%</span>
                    </div>
                  ))}
                </div>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await saveFundComposition(preview);
                      setPreview(null);
                    })
                  }
                >
                  {t("exposure.save")}
                </Button>
              </div>
            )}
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
          </div>
        </details>
      )}
      {members.some((m) => m.view.snapshots.length > 0) && (
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer">{t("exposure.sources")}</summary>
          <div className="mt-3 space-y-2">
            {members.flatMap((m) =>
              m.view.snapshots.map((s) => (
                <p className="text-sm" key={`${m.memberId}:${s.assetId}`}>
                  {m.memberName} ·{" "}
                  {m.view.positions.find((p) => p.assetId === s.assetId)?.name ?? s.assetId} ·{" "}
                  {s.source} · {s.asOf ?? t("exposure.unknown_date")} · {s.constituents.length}{" "}
                  {t("exposure.rows")}
                </p>
              )),
            )}
          </div>
        </details>
      )}
      <Input
        aria-label={t("exposure.search")}
        placeholder={t("exposure.search")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="space-y-3">
        {rows.length === 0 && <p className="text-muted-foreground">{t("exposure.empty")}</p>}
        {rows.map((row) => (
          <details key={row.identifier} className="rounded-xl border p-4">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{row.name}</p>
                  <p className="text-muted-foreground text-xs">{row.identifier}</p>
                </div>
                <PrivacyAmount
                  value={row.direct + row.indirect}
                  currency={currency}
                  className="font-semibold"
                />
              </div>
              <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <span>
                  {t("exposure.direct")}: <PrivacyAmount value={row.direct} currency={currency} />
                </span>
                <span>
                  {t("exposure.indirect")}:{" "}
                  <PrivacyAmount value={row.indirect} currency={currency} />
                </span>
              </div>
            </summary>
            <div className="mt-4 space-y-3 border-t pt-3">
              {row.contributions.map((part, index) => (
                <div className="flex flex-wrap justify-between gap-3 text-sm" key={index}>
                  <div>
                    <p>
                      {part.memberName} {part.viaFund ?? t("exposure.direct")}
                    </p>
                    {part.viaFund && (
                      <p className="text-muted-foreground text-xs">
                        {part.source} · {part.asOf ?? t("exposure.unknown_date")}
                      </p>
                    )}
                  </div>
                  <PrivacyAmount value={Number(part.value)} currency={currency} />
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
