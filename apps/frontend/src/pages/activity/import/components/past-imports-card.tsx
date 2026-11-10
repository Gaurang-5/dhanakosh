import { getAccounts, getImportRuns, undoActivityImport } from "@/adapters";
import { usePortfolios } from "@/hooks/use-portfolios";
import { accountLabel } from "@/lib/account-label";
import { QueryKeys } from "@/lib/query-keys";
import type { Account } from "@/lib/types";
import type { ImportRun, ImportRunStatus } from "@/features/wealthfolio-connect/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDateFormatting, Spinner } from "@wealthfolio/ui";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@wealthfolio/ui/components/ui/alert-dialog";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@wealthfolio/ui/components/ui/dropdown-menu";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wealthfolio/ui/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@wealthfolio/ui/components/ui/collapsible";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import { useState } from "react";
import { useTranslation } from "react-i18next";

const CSV_IMPORT_RUNS_KEY = [QueryKeys.IMPORT_RUNS, "IMPORT", "csv"] as const;

export function visibleCsvImports(runs: ImportRun[]): ImportRun[] {
  return runs.filter((run) => run.runType === "IMPORT" && run.sourceSystem === "csv");
}

function statusLabelKey(status: ImportRunStatus): string {
  switch (status) {
    case "APPLIED":
      return "activity:import.history.statusApplied";
    case "REVERTED":
      return "activity:import.history.statusReverted";
    case "FAILED":
      return "activity:import.history.statusFailed";
    case "RUNNING":
      return "activity:import.history.statusRunning";
    case "CANCELLED":
      return "activity:import.history.statusCancelled";
    case "NEEDS_REVIEW":
      return "activity:import.history.statusNeedsReview";
  }
}

interface PastImportsCardProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function PastImportsCard({ open, onOpenChange }: PastImportsCardProps = {}) {
  const { t } = useTranslation();
  const formatting = useDateFormatting();
  const queryClient = useQueryClient();
  const [pendingRun, setPendingRun] = useState<ImportRun | null>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = open ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const { data: accounts = [] } = useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS],
    queryFn: () => getAccounts(),
  });
  const { data: portfolios = [] } = usePortfolios();
  const runsQuery = useQuery({
    queryKey: CSV_IMPORT_RUNS_KEY,
    queryFn: () => getImportRuns({ runType: "IMPORT", limit: 100, offset: 0 }),
  });

  const undoMutation = useMutation({
    mutationFn: (importRunId: string) => undoActivityImport(importRunId),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: [QueryKeys.IMPORT_RUNS] });
      await queryClient.invalidateQueries({ queryKey: [QueryKeys.ACTIVITY_DATA] });
      await queryClient.invalidateQueries({ queryKey: [QueryKeys.ACTIVITIES] });
      toast({
        title: t("activity:import.history.undoSuccess", { count: result.removed }),
      });
      setPendingRun(null);
    },
    onError: (error: unknown) => {
      const description =
        error instanceof Error ? error.message : t("activity:import.history.undoError");
      toast({
        title: t("activity:import.history.undoError"),
        description,
        variant: "destructive",
      });
    },
  });

  const runs = visibleCsvImports(runsQuery.data ?? []);
  const accountName = (accountId: string) => {
    const account = accounts.find((item) => item.id === accountId);
    return account
      ? accountLabel(account, portfolios)
      : t("activity:import.history.unknownAccount");
  };
  const runLabel = (run: ImportRun) => {
    const fileName = run.summary?.fileName?.trim();
    return fileName && fileName.length > 0
      ? fileName
      : formatting.formatDateTime(new Date(run.startedAt));
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setOpen}>
      <Card id="past-imports">
        <CollapsibleTrigger
          render={
            <button
              type="button"
              className="hover:bg-accent/40 flex w-full items-center justify-between gap-3 px-6 py-4 text-start"
            />
          }
        >
          <span className="text-base font-medium">{t("activity:import.history.title")}</span>
          <Icons.ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardHeader className="pt-0">
            <CardTitle className="sr-only">{t("activity:import.history.title")}</CardTitle>
            <CardDescription>{t("activity:import.history.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            {runsQuery.isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Spinner className="text-muted-foreground h-5 w-5" />
              </div>
            ) : runsQuery.isError ? (
              <p className="text-destructive text-sm">{t("activity:import.history.loadError")}</p>
            ) : runs.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("activity:import.history.empty")}</p>
            ) : (
              <ul className="space-y-2">
                {runs.map((run) => {
                  const inserted = run.summary?.inserted ?? 0;
                  const skipped = run.summary?.skipped ?? 0;
                  return (
                    <li
                      key={run.id}
                      className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 text-start">
                        <p className="truncate text-sm font-medium">{runLabel(run)}</p>
                        <p className="text-muted-foreground text-xs">
                          {accountName(run.accountId)}
                          {" · "}
                          {t("activity:import.history.inserted", { count: inserted })}
                          {skipped > 0
                            ? ` · ${t("activity:import.history.skipped", { count: skipped })}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={run.status === "FAILED" ? "destructive" : "secondary"}>
                          {t(statusLabelKey(run.status))}
                        </Badge>
                        {run.status === "APPLIED" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              aria-label={t("activity:import.history.options")}
                              className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-8 w-8 items-center justify-center rounded-md"
                              disabled={undoMutation.isPending}
                            >
                              <Icons.DotsThreeVertical className="h-4 w-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                variant="destructive"
                                disabled={undoMutation.isPending}
                                onClick={() => setPendingRun(run)}
                              >
                                {t("activity:import.history.undo")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </CollapsibleContent>

        <AlertDialog
          open={pendingRun !== null}
          onOpenChange={(open) => {
            if (!open && !undoMutation.isPending) setPendingRun(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("activity:import.history.confirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {pendingRun
                  ? t("activity:import.history.confirmDescription", {
                      count: pendingRun.summary?.inserted ?? 0,
                      label: runLabel(pendingRun),
                    })
                  : null}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={undoMutation.isPending}>
                {t("activity:import.history.keep")}
              </AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={undoMutation.isPending || pendingRun === null}
                onClick={() => {
                  if (pendingRun) undoMutation.mutate(pendingRun.id);
                }}
              >
                {undoMutation.isPending
                  ? t("activity:import.history.undoing")
                  : t("activity:import.history.confirmAction")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>
    </Collapsible>
  );
}
