import { SyncStatusIcon } from "@/features/wealthfolio-connect/components/sync-status-icon";
import { useAggregatedSyncStatus } from "@/features/wealthfolio-connect/hooks";
import { HOUSEHOLD_MODE } from "@/features/household/household-config";
import { formatDistanceToNow } from "@/lib/utils";
import { Icons, useLocalizationSettings, buttonVariants } from "@wealthfolio/ui";
import { Tooltip, TooltipContent, TooltipTrigger } from "@wealthfolio/ui/components/ui/tooltip";
import { cn } from "@wealthfolio/ui/lib/utils";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { isPathActive } from "./app-navigation";

interface ConnectNavItemProps {
  collapsed: boolean;
}

export function ConnectNavItem({ collapsed }: ConnectNavItemProps) {
  const localizationSettings = useLocalizationSettings();

  const { t } = useTranslation();
  const location = useLocation();
  const { status, lastSyncTime } = useAggregatedSyncStatus();
  const destination = HOUSEHOLD_MODE ? "/import" : "/connect";
  const isActive = isPathActive(location.pathname, destination);
  const navLabel = HOUSEHOLD_MODE ? t("common:import") : t("common:connect");

  const tooltipContent = HOUSEHOLD_MODE
    ? t("common:import")
    : status === "restoring"
      ? t("connect:session.restoring", { defaultValue: "Restoring Connect…" })
      : status === "unavailable"
        ? t("connect:session.unavailable", { defaultValue: "Connect is temporarily unavailable" })
        : status === "subscription_required"
          ? t("connect:subscription.syncPausedTooltip")
          : lastSyncTime
            ? t("common:layout.connect_last_synced", {
                time: formatDistanceToNow(new Date(lastSyncTime), localizationSettings, {
                  addSuffix: true,
                }),
              })
            : t("common:connect");

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            to={destination}
            title={tooltipContent}
            aria-label={
              !HOUSEHOLD_MODE &&
              (status === "subscription_required" ||
                status === "restoring" ||
                status === "unavailable")
                ? `${navLabel}: ${tooltipContent}`
                : undefined
            }
            aria-current={isActive ? "page" : undefined}
            className={cn(
              buttonVariants({ variant: isActive ? "secondary" : "ghost" }),
              cn(
                "text-foreground [&_svg]:size-5! mb-1 h-12 rounded-md transition-all duration-300",
                collapsed ? "justify-center" : "justify-start",
              ),
            )}
          />
        }
      >
        <span aria-hidden="true">
          {HOUSEHOLD_MODE ? (
            <Icons.FileSpreadsheet className="size-5" />
          ) : (
            <SyncStatusIcon status={status} className="size-5" />
          )}
        </span>

        <span
          className={cn({
            "ms-2 flex flex-col items-start transition-opacity delay-100 duration-300 ease-in-out": true,
            "sr-only opacity-0": collapsed,
            "block opacity-100": !collapsed,
          })}
        >
          {navLabel}
        </span>
      </TooltipTrigger>
      <TooltipContent side="inline-end">{tooltipContent}</TooltipContent>
    </Tooltip>
  );
}
