import { previewFundComposition, saveFundComposition } from "@/adapters";
import type { FundComposition } from "@/adapters/shared/fund-exposure";
import { readFundCompositionFile } from "@/features/fund-exposure/fund-composition-file";
import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@wealthfolio/ui/components/ui/dialog";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Label } from "@wealthfolio/ui/components/ui/label";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export interface FundCompositionUploadTarget {
  assetId: string;
  name: string;
}

interface FundCompositionUploadDialogProps {
  target: FundCompositionUploadTarget | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (name: string) => void;
}

export function FundCompositionUploadDialog({
  target,
  onOpenChange,
  onSaved,
}: FundCompositionUploadDialogProps) {
  const { t } = useTranslation();
  const [source, setSource] = useState("");
  const [asOf, setAsOf] = useState("");
  const [preview, setPreview] = useState<FundComposition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function close(open: boolean) {
    if (!open) {
      setSource("");
      setAsOf("");
      setPreview(null);
      setError(null);
      setPending(false);
    }
    onOpenChange(open);
  }

  return (
    <Dialog open={target !== null} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("health:issues.fund_composition_missing.uploadTitle")}</DialogTitle>
          <DialogDescription>
            {t("health:issues.fund_composition_missing.uploadDescription", {
              name: target?.name ?? "",
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <p className="text-muted-foreground text-sm">{t("insights:exposure.import_help")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="health-composition-source">{t("insights:exposure.source")}</Label>
              <Input
                id="health-composition-source"
                value={source}
                onChange={(event) => setSource(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="health-composition-date">{t("insights:exposure.date")}</Label>
              <Input
                id="health-composition-date"
                type="date"
                value={asOf}
                onChange={(event) => setAsOf(event.target.value)}
              />
            </div>
          </div>
          <Input
            aria-label={t("insights:exposure.file")}
            type="file"
            accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={!target || !source.trim() || !asOf || pending}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file || !target) return;
              const assetId = target.assetId;
              const schemeName = target.name;
              setPending(true);
              setError(null);
              void readFundCompositionFile(file, schemeName)
                .then((csvText) => previewFundComposition(assetId, source.trim(), asOf, csvText))
                .then((result) => setPreview(result))
                .catch((caught: unknown) => {
                  setPreview(null);
                  setError(caught instanceof Error ? caught.message : String(caught));
                })
                .finally(() => setPending(false));
            }}
          />
          {preview && (
            <div className="max-h-64 divide-y overflow-auto rounded-lg border">
              {preview.constituents.map((row) => (
                <div
                  key={row.identifier}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate">{row.name}</span>
                  <span className="shrink-0">{row.weightPercent}%</span>
                </div>
              ))}
            </div>
          )}
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            disabled={!preview || pending}
            onClick={() => {
              if (!preview || !target) return;
              const saved = preview;
              const name = target.name;
              setPending(true);
              setError(null);
              void saveFundComposition(saved)
                .then(() => {
                  close(false);
                  onSaved(name);
                })
                .catch((caught: unknown) => {
                  setError(caught instanceof Error ? caught.message : String(caught));
                })
                .finally(() => setPending(false));
            }}
          >
            {t("insights:exposure.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
