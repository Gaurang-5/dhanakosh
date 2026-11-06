import { useIsMobileViewport } from "@/hooks/use-platform";
import { useAssets } from "@/pages/asset/hooks/use-assets";
import {
  holdingSector,
  isFundHolding,
  stockSectorLookup,
} from "@/features/fund-exposure/stock-sectors";
import { RenderableChartContainer } from "@/components/renderable-chart-container";
import { TickerAvatar } from "@/components/ticker-avatar";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { getBaseHoldingPerformancePercentForMode } from "@/lib/holding-performance";
import { getInstrumentAvatarIdentity, getInstrumentPrimaryLabel } from "@/lib/instrument-display";
import { useSettingsContext } from "@/lib/settings-provider";
import { Holding } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  AmountDisplay,
  AnimatedToggleGroup,
  useDateFormatting,
  useNumberFormatting,
} from "@wealthfolio/ui";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { useDirection } from "@wealthfolio/ui/components/ui/direction";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@wealthfolio/ui/components/ui/dialog";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@wealthfolio/ui/components/ui/empty";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@wealthfolio/ui/components/ui/tooltip";
import { useEffect, useMemo, useState, useSyncExternalStore, type FC } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Tooltip as ChartTooltip, Treemap, type TreemapNode } from "recharts";
import { heatmapScaleStops, mobileSectorChrome, mobileTileLayout } from "./composition-mobile";
import {
  fallbackPalette,
  getTreemapColor,
  getTreemapPaletteSnapshot,
  subscribeToTreemapTheme,
  type ReturnType,
  type TreemapPalette,
} from "./treemap-palette";

type DisplayMode = "symbol" | "name";

const DisplayModeToggle: React.FC<{
  displayMode: DisplayMode;
  onToggle: () => void;
}> = ({ displayMode, onToggle }) => {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="secondary"
            size="icon-sm"
            className="rounded-full"
            onClick={onToggle}
            aria-label={
              displayMode === "symbol" ? t("holdings:show_full_names") : t("holdings:show_symbols")
            }
          />
        }
      >
        {displayMode === "symbol" ? (
          <Icons.Hash className="h-4 w-4" />
        ) : (
          <Icons.Type className="h-4 w-4" />
        )}
      </TooltipTrigger>
      <TooltipContent>
        <p>
          {displayMode === "symbol" ? t("holdings:show_full_names") : t("holdings:show_symbols")}
        </p>
      </TooltipContent>
    </Tooltip>
  );
};

// Function to truncate text based on available width
function truncateText(text: string, maxWidth: number, fontSize: number): string {
  if (!text) return "";

  // Approximate character width based on fontSize (rough estimate)
  const charWidth = fontSize * 0.6;
  const maxChars = Math.floor(maxWidth / charWidth);

  if (text.length <= maxChars) return text;

  // If we need to truncate, leave space for "..."
  const truncatedLength = Math.max(1, maxChars - 3);
  return text.substring(0, truncatedLength) + "...";
}

interface CustomizedContentProps {
  depth?: TreemapNode["depth"];
  x?: TreemapNode["x"];
  y?: TreemapNode["y"];
  width?: TreemapNode["width"];
  height?: TreemapNode["height"];
  id?: string; // Asset ID for navigation
  symbol?: string;
  name?: TreemapNode["name"];
  avatarSymbol?: string;
  assetId?: string;
  exchangeMic?: string | null;
  instrumentType?: string | null;
  gain?: number;
  weight?: number;
  displayMode?: DisplayMode;
  returnType?: ReturnType;
  palette?: TreemapPalette;
  exposureMode?: boolean;
  logoOnly?: boolean;
  grouped?: boolean;
  onGroupClick?: (name: string) => void;
  groupActionLabel?: string;
  mobile?: boolean;
  rtl?: boolean;
  root?: { x?: number; y?: number; width?: number; height?: number; name?: string };
}

const CustomizedContent: FC<CustomizedContentProps> = ({
  depth = 0,
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  id,
  symbol,
  name,
  avatarSymbol,
  assetId,
  exchangeMic,
  instrumentType,
  gain = 0,
  weight = 0,
  displayMode = "symbol",
  returnType = "daily",
  palette = fallbackPalette,
  exposureMode = false,
  logoOnly = false,
  grouped = false,
  onGroupClick,
  groupActionLabel,
  mobile = false,
  rtl = false,
  root,
}) => {
  const isGroup = grouped && depth === 1;
  const isTile = grouped ? depth === 2 : depth === 1;
  // Reserve a real header and gutter per sector, then map every stock into that
  // inner rectangle. Trimming just the top row can erase small constituents.
  if (grouped && isTile && root?.width && root.height) {
    const chrome = mobile ? mobileSectorChrome(root.width, root.height) : null;
    const gutter = chrome ? chrome.gutter : Math.min(4, root.width / 10, root.height / 10);
    const header = chrome ? chrome.header : Math.min(30, root.height * 0.2);
    const scaleX = Math.max(0, root.width - gutter * 2) / root.width;
    const scaleY = Math.max(0, root.height - header - gutter) / root.height;
    x = (root.x ?? 0) + gutter + (x - (root.x ?? 0)) * scaleX;
    y = (root.y ?? 0) + header + (y - (root.y ?? 0)) * scaleY;
    width *= scaleX;
    height *= scaleY;
  }
  const formatting = useNumberFormatting();
  const fontSize = Math.min(width, height) < 80 ? Math.min(width, height) * 0.16 : 13;
  const fontSize2 = Math.min(width, height) < 80 ? Math.min(width, height) * 0.14 : 12;
  const { fill: fillColor, isLightTile } = getTreemapColor(
    exposureMode ? weight : gain,
    returnType,
    palette,
  );
  // Labels by tile luminance; dark mode's translucent tiles always need the light one.
  const label = palette.isDark || !isLightTile ? palette.labelLight : palette.labelDark;
  const textColor = `rgb(${label.join(",")})`;

  // Determine what text to display based on mode
  const displayText = displayMode === "name" && name ? name : symbol;
  // Truncate text to fit within the available width (with some padding)
  const truncatedText = truncateText(displayText || "", width - 16, fontSize + 1);
  const showLabel = !logoOnly && width >= 80 && height >= 52;
  const showLogo = width >= 18 && height >= 18 && !!avatarSymbol;
  const logoSize = Math.max(8, Math.min(48, Math.min(width, height) * (showLabel ? 0.28 : 0.65)));
  const labelCenterY = y + height / 2 + (showLogo ? logoSize * 0.42 : 0);
  const logoY = !showLabel ? y + height / 2 - logoSize / 2 : labelCenterY - logoSize - fontSize - 4;

  if (isGroup && mobile) {
    const chrome = mobileSectorChrome(width, height);
    const captionName = truncateText(name ?? "", width - 22, 11);
    const caption = rtl ? `‹ ${captionName}` : `${captionName} ›`;
    return (
      <g
        role="button"
        tabIndex={0}
        aria-label={groupActionLabel}
        className="cursor-zoom-in"
        onClick={() => onGroupClick?.(name ?? "")}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onGroupClick?.(name ?? "");
          }
        }}
      >
        <title>{groupActionLabel}</title>
        <rect x={x} y={y} width={width} height={height} className="fill-card" />
        {chrome.labeled && (
          <text
            x={rtl ? x + width - 6 : x + 6}
            y={y + 10}
            textAnchor={rtl ? "end" : "start"}
            className="fill-muted-foreground text-[11px] font-medium"
          >
            {caption}
          </text>
        )}
      </g>
    );
  }

  if (isGroup) {
    return (
      <g
        role="button"
        tabIndex={0}
        aria-label={groupActionLabel}
        className="cursor-zoom-in"
        onClick={() => onGroupClick?.(name ?? "")}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onGroupClick?.(name ?? "");
          }
        }}
      >
        <title>{groupActionLabel}</title>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          className="fill-card stroke-border stroke-[1px]"
        />
        {width >= 40 && height >= 36 && (
          <>
            <rect x={x + 2} y={y + 2} width={width - 4} height={26} className="fill-muted" />
            <text x={x + 10} y={y + 20} className="fill-foreground text-xs font-semibold">
              {truncateText(name ?? "", width - 34, 12)}
            </text>
            {width >= 55 && (
              <text x={x + width - 14} y={y + 20} className="fill-muted-foreground text-sm">
                ›
              </text>
            )}
          </>
        )}
      </g>
    );
  }

  if (mobile && isTile) {
    const tile = mobileTileLayout(width, height, !!avatarSymbol);
    const percentText = exposureMode
      ? formatting.formatPercent(weight)
      : gain > 0
        ? "+" + formatting.formatPercent(gain)
        : formatting.formatPercent(gain);
    const symbolText = truncateText(displayText || "", Math.max(0, width - 8), tile.symbolSize);
    const rows = [
      tile.showLogo ? tile.logoSize : 0,
      tile.showSymbol ? tile.symbolSize : 0,
      tile.showPercent ? tile.percentSize : 0,
    ].filter((size) => size > 0);
    const rowGap = 2;
    const stackHeight =
      rows.reduce((sum, size) => sum + size, 0) + rowGap * Math.max(0, rows.length - 1);
    let cursor = y + Math.max(0, (height - stackHeight) / 2);
    let logoTop = cursor;
    let symbolY = cursor;
    let percentY = cursor;
    if (tile.showLogo) {
      logoTop = cursor;
      cursor += tile.logoSize + rowGap;
    }
    if (tile.showSymbol) {
      symbolY = cursor + tile.symbolSize * 0.82;
      cursor += tile.symbolSize + rowGap;
    }
    if (tile.showPercent) {
      percentY = cursor + tile.percentSize * 0.82;
    }
    const tileBody = (
      <g style={{ cursor: exposureMode ? "default" : "pointer" }}>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          className="stroke-card stroke-[1.5px]"
          style={{
            fill: fillColor,
            fillOpacity: palette.isDark ? 0.45 : undefined,
          }}
        />
        {tile.showLogo ? (
          <foreignObject
            x={x + width / 2 - tile.logoSize / 2}
            y={logoTop}
            width={tile.logoSize}
            height={tile.logoSize}
            pointerEvents="none"
          >
            <TickerAvatar
              symbol={avatarSymbol ?? ""}
              assetId={assetId}
              exchangeMic={exchangeMic}
              instrumentType={instrumentType}
              fallbackName={exposureMode ? name : undefined}
              className="size-full bg-white/90 shadow-sm"
              imageClassName="object-contain p-0.5"
            />
          </foreignObject>
        ) : null}
        {tile.showSymbol ? (
          <text
            x={x + width / 2}
            y={symbolY}
            textAnchor="middle"
            fill={textColor}
            className="font-default"
            style={{ fontSize: tile.symbolSize, fontWeight: 600 }}
          >
            {symbolText}
          </text>
        ) : null}
        {tile.showPercent ? (
          <text
            x={x + width / 2}
            y={percentY}
            textAnchor="middle"
            fill={textColor}
            className="font-default"
            style={{ fontSize: tile.percentSize }}
          >
            {percentText}
          </text>
        ) : null}
      </g>
    );
    const sectorName = grouped ? root?.name : undefined;
    const openHolding = !exposureMode && (tile.showSymbol || !sectorName) && Boolean(id || symbol);
    if (!openHolding && sectorName && !tile.showSymbol && !tile.showPercent) {
      return (
        <g
          role="button"
          tabIndex={0}
          aria-label={sectorName}
          className="cursor-zoom-in"
          onClick={() => onGroupClick?.(sectorName)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onGroupClick?.(sectorName);
            }
          }}
        >
          {tileBody}
        </g>
      );
    }
    if (openHolding) {
      return (
        <Link
          to={`/holdings/${encodeURIComponent(id || symbol || "")}`}
          aria-label={`${displayText ?? ""} ${percentText}`}
        >
          {tileBody}
        </Link>
      );
    }
    return tileBody;
  }

  return (
    <g style={{ cursor: "pointer" }}>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={0}
        ry={0}
        className={cn("stroke-card", {
          "stroke-[1px]": isTile,
          "fill-none stroke-0": depth === 0,
        })}
        style={{
          fill: isTile ? fillColor : undefined,
          // Soften tiles in dark mode so they blend into the background instead
          // of reading as bright rectangles on near-black.
          fillOpacity: isTile && palette.isDark ? 0.45 : undefined,
          cursor: "pointer",
        }}
      />
      {isTile ? (
        <>
          {showLogo ? (
            <foreignObject
              x={x + width / 2 - logoSize / 2}
              y={logoY}
              width={logoSize}
              height={logoSize}
              pointerEvents="none"
            >
              <TickerAvatar
                symbol={avatarSymbol}
                assetId={assetId}
                exchangeMic={exchangeMic}
                instrumentType={instrumentType}
                fallbackName={exposureMode ? name : undefined}
                className="size-full bg-white/85 shadow-sm"
                imageClassName="object-contain p-0.5"
              />
            </foreignObject>
          ) : null}
          {!showLabel ? null : exposureMode ? (
            <text
              x={x + width / 2}
              y={labelCenterY}
              textAnchor="middle"
              fill={textColor}
              className="font-default text-sm"
              style={{ fontSize: fontSize + 1 }}
            >
              {truncatedText}
            </text>
          ) : (
            <Link to={`/holdings/${encodeURIComponent(id || symbol || "")}`}>
              <text
                x={x + width / 2}
                y={labelCenterY}
                textAnchor="middle"
                fill={textColor}
                className="font-default cursor-pointer text-sm hover:underline"
                style={{
                  fontSize: fontSize + 1,
                }}
              >
                {truncatedText}
              </text>
            </Link>
          )}

          {showLabel && (
            <text
              x={x + width / 2}
              y={labelCenterY + fontSize}
              textAnchor="middle"
              fill={textColor}
              style={{ fontSize: fontSize2 }}
            >
              {exposureMode
                ? formatting.formatPercent(weight)
                : gain > 0
                  ? "+" + formatting.formatPercent(gain)
                  : formatting.formatPercent(gain)}
            </text>
          )}
        </>
      ) : null}
    </g>
  );
};

interface PortfolioCompositionProps {
  holdings: Holding[];
  currency?: string;
  isLoading?: boolean;
  exposureMode?: boolean;
  sectorByHoldingId?: Record<string, string>;
}

interface TooltipProps {
  active?: boolean;
  payload?: {
    value: number;
    payload: {
      symbol: string;
      name?: string;
      gain: number;
      asOfDate?: string;
    };
  }[];
  settings?: {
    baseCurrency?: string;
    theme?: string;
  };
}

const CompositionTooltip = ({
  active,
  payload,
  settings,
  exposureMode = false,
}: TooltipProps & { exposureMode?: boolean }) => {
  const numberFormatting = useNumberFormatting();
  const dateFormatting = useDateFormatting();
  const { isBalanceHidden } = useBalancePrivacy();

  const { t } = useTranslation();
  if (active && payload?.length) {
    const data = payload[0].payload;
    const value = payload[0].value;
    const gain = data.gain || 0;
    const isPositive = gain >= 0;

    return (
      <Card>
        <CardContent className="space-y-3 p-4">
          {/* Header with symbol and name */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-primary text-sm font-bold">{data.symbol}</span>
              <span className="text-muted-foreground text-xs">
                {data.asOfDate ? dateFormatting.formatCalendarDate(data.asOfDate) : ""}
              </span>
            </div>
            <p className="text-muted-foreground text-xs leading-tight">{data.name}</p>
          </div>

          {/* Divider */}
          <div className="border-t" />

          {/* Market Value */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground pe-6 text-sm">
                {t("holdings:market_value_label")}
              </span>
              <AmountDisplay
                value={value}
                currency={settings?.baseCurrency ?? "USD"}
                isHidden={isBalanceHidden}
                className="text-sm font-semibold"
              />
            </div>

            {/* Gain/Loss */}
            {!exposureMode && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">{t("holdings:return")}</span>
                <span
                  className={cn(
                    "flex items-center gap-1 text-sm font-semibold",
                    isPositive ? "text-gain" : "text-loss",
                  )}
                >
                  {isPositive ? "+" : ""}
                  {numberFormatting.formatPercent(gain)}
                  <span className="text-xs">{isPositive ? "↗" : "↘"}</span>
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }
  return null;
};

const HeatmapScale = ({
  returnType,
  palette,
}: {
  returnType: ReturnType;
  palette: TreemapPalette;
}) => {
  const formatting = useNumberFormatting();
  const stops = heatmapScaleStops(returnType);
  const samples = 24;
  const gradient = Array.from({ length: samples }, (_, index) => {
    const t = index / (samples - 1);
    const value = stops[0] + (stops[stops.length - 1] - stops[0]) * t;
    return `${getTreemapColor(value, returnType, palette).fill} ${(t * 100).toFixed(2)}%`;
  }).join(", ");

  return (
    <div className="mt-2 shrink-0">
      <div className="text-muted-foreground flex justify-between text-[10px] tabular-nums">
        {stops.map((stop) => (
          <span key={stop}>{formatting.formatPercent(stop, { digits: 0 })}</span>
        ))}
      </div>
      <div
        className="mt-1 h-2"
        style={{
          background: `linear-gradient(to inline-end, ${gradient})`,
          opacity: palette.isDark ? 0.45 : 1,
        }}
      />
    </div>
  );
};

export function PortfolioComposition({
  holdings,
  currency,
  isLoading,
  exposureMode = false,
  sectorByHoldingId,
}: PortfolioCompositionProps) {
  const [returnType, setReturnType] = usePersistentState<ReturnType>(
    "composition-performance-mode",
    "daily",
  );
  const [displayMode, setDisplayMode] = usePersistentState<DisplayMode>(
    "composition-display-mode",
    "symbol",
  );
  const { settings } = useSettingsContext();
  const { assets } = useAssets();
  const sectorLookup = useMemo(() => stockSectorLookup(assets), [assets]);
  const { t } = useTranslation();
  const mobile = useIsMobileViewport();
  const rtl = useDirection() === "rtl";
  const [fullScreen, setFullScreen] = useState(false);
  const [focusedSector, setFocusedSector] = useState<string | null>(null);
  useEffect(() => setFocusedSector(null), [exposureMode]);
  const palette = useSyncExternalStore(
    subscribeToTreemapTheme,
    getTreemapPaletteSnapshot,
    () => fallbackPalette,
  );

  const toggleDisplayMode = () => {
    setDisplayMode(displayMode === "symbol" ? "name" : "symbol");
  };

  const data = useMemo(() => {
    // Map holdings directly, assuming backend provides aggregated data
    const processedData = holdings
      .map((holding) => {
        const symbol = holding.instrument?.symbol;
        if (!symbol) return null; // Skip if no symbol
        const avatarIdentity = getInstrumentAvatarIdentity(holding.instrument);

        const gain = getBaseHoldingPerformancePercentForMode(holding, returnType) ?? 0;

        const marketValue = Number(holding.marketValue?.base) || 0;

        // Basic validation
        if (isNaN(gain) || isNaN(marketValue) || marketValue <= 0) return null;

        return {
          id: holding.instrument?.id, // Asset ID for navigation
          holdingId: holding.id,
          sector: isFundHolding(holding) ? "MF + ETFs" : holdingSector(holding, sectorLookup),
          symbol: getInstrumentPrimaryLabel(holding.instrument),
          name: holding.instrument?.name,
          avatarSymbol: avatarIdentity.symbol,
          assetId: holding.instrument?.id,
          exchangeMic: avatarIdentity.exchangeMic,
          instrumentType: holding.instrument?.instrumentType,
          marketValueConverted: marketValue,
          weight: holding.weight,
          gain,
          asOfDate: holding.asOfDate,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null); // Explicit non-null filter

    // Sort by market value after processing all holdings
    processedData.sort((a, b) => b.marketValueConverted - a.marketValueConverted);

    return processedData;
  }, [holdings, returnType, sectorLookup]);

  const chartData = useMemo(() => {
    const groups = new Map<string, typeof data>();
    for (const item of data) {
      const sector = sectorByHoldingId?.[item.holdingId] ?? item.sector;
      groups.set(sector, [...(groups.get(sector) ?? []), item]);
    }
    return [...groups]
      .map(([name, children]) => ({
        name,
        children,
        marketValueConverted: children.reduce((sum, item) => sum + item.marketValueConverted, 0),
      }))
      .sort((a, b) => b.marketValueConverted - a.marketValueConverted);
  }, [data, sectorByHoldingId]);
  const focusedGroup = chartData.find((group) => group.name === focusedSector);
  const visibleChartData = focusedGroup ? focusedGroup.children : chartData;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center space-x-2">
            <Icons.LayoutDashboard className="text-muted-foreground h-4 w-4" />
            <CardTitle className="text-muted-foreground text-sm font-medium uppercase tracking-wider">
              {t("holdings:composition")}
            </CardTitle>
          </div>
          <div className="flex items-center space-x-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-8 w-32 rounded-full" />
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-125 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (holdings.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center space-x-2">
            <Icons.LayoutDashboard className="text-muted-foreground h-4 w-4" />
            <CardTitle className="text-md font-medium">{t("holdings:composition")}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="h-125 flex items-center justify-center">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">{<Icons.BarChart className="size-10" />}</EmptyMedia>
              <EmptyTitle>{t("holdings:no_holdings_data")}</EmptyTitle>
              <EmptyDescription>{t("holdings:no_holdings_data_desc")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  const compositionCard = (expanded: boolean) => (
    <Card className={expanded ? "flex h-full min-h-0 flex-col" : undefined}>
      <CardHeader
        className={cn(
          "flex shrink-0 flex-row flex-wrap items-center justify-between gap-2 space-y-0",
          mobile && "p-3",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {mobile && focusedGroup ? (
            <button
              type="button"
              className="flex min-w-0 items-center gap-1 text-sm font-medium"
              onClick={() => setFocusedSector(null)}
              aria-label={t("common:back")}
            >
              <Icons.ChevronLeft className="size-4 shrink-0 rtl:rotate-180" />
              <span>{t("holdings:heatmap_all")}</span>
              <span className="text-muted-foreground" aria-hidden>
                ·
              </span>
              <span className="truncate">{focusedGroup.name}</span>
            </button>
          ) : (
            <>
              <CardTitle className="text-muted-foreground text-sm font-medium uppercase tracking-wider">
                {t("holdings:composition")}
              </CardTitle>
              {focusedGroup && (
                <>
                  <Icons.ChevronRight className="text-muted-foreground size-3 shrink-0 rtl:rotate-180" />
                  <span className="truncate text-sm font-medium">{focusedGroup.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFocusedSector(null)}
                    aria-label={t("common:back")}
                  >
                    <Icons.ArrowLeft className="size-4 rtl:rotate-180" />
                    {t("common:back")}
                  </Button>
                </>
              )}
            </>
          )}
        </div>
        <div
          className={cn(
            "flex items-center space-x-3",
            mobile && "max-w-full flex-wrap justify-end",
          )}
        >
          <Button
            variant="ghost"
            size="icon-xs"
            className="rounded-full"
            onClick={() => {
              setFullScreen(!expanded);
            }}
            aria-label={t(
              expanded ? "common:component.exit_focus_mode" : "common:component.enter_focus_mode",
            )}
          >
            {expanded ? <Icons.X className="size-4" /> : <Icons.Fullscreen className="size-4" />}
          </Button>
          <DisplayModeToggle displayMode={displayMode} onToggle={toggleDisplayMode} />
          {!exposureMode && (
            <AnimatedToggleGroup
              items={[
                { value: "daily", label: t("holdings:daily") },
                { value: "pnl", label: t("holdings:pnl") },
                { value: "return", label: t("holdings:return") },
              ]}
              value={returnType}
              onValueChange={(value: ReturnType) => setReturnType(value)}
              size="sm"
            />
          )}
        </div>
      </CardHeader>
      <CardContent
        className={cn(
          "min-w-0",
          mobile ? "px-2 pb-3" : "ps-2",
          expanded && "min-h-0 flex-1 overflow-hidden",
          expanded && mobile && "flex flex-col",
        )}
      >
        <div
          className={cn(
            "relative w-full overflow-hidden",
            expanded
              ? mobile
                ? "min-h-0 flex-1"
                : "h-full min-h-0"
              : mobile
                ? "h-[min(72dvh,40rem)]"
                : "h-125",
          )}
        >
          <div className="absolute inset-0">
            <RenderableChartContainer className="size-full">
              <Treemap
                width={400}
                height={200}
                data={visibleChartData}
                dataKey="marketValueConverted"
                isAnimationActive={false}
                content={(props: TreemapNode) => (
                  <CustomizedContent
                    {...props}
                    displayMode={displayMode}
                    returnType={returnType}
                    palette={palette}
                    exposureMode={exposureMode}
                    logoOnly={false}
                    grouped={!focusedGroup}
                    mobile={mobile}
                    rtl={rtl}
                    onGroupClick={setFocusedSector}
                    groupActionLabel={t("holdings:holdings_in_sector", { sector: props.name })}
                  />
                )}
              >
                {!mobile && (
                  <ChartTooltip
                    content={
                      <CompositionTooltip
                        settings={{ ...settings, baseCurrency: currency ?? settings?.baseCurrency }}
                        exposureMode={exposureMode}
                      />
                    }
                  />
                )}
              </Treemap>
            </RenderableChartContainer>
          </div>
        </div>
        {mobile && !exposureMode ? (
          <HeatmapScale returnType={returnType} palette={palette} />
        ) : null}
      </CardContent>
    </Card>
  );

  return (
    <>
      {compositionCard(false)}
      <Dialog open={fullScreen} onOpenChange={setFullScreen} useIsMobile={() => false}>
        <DialogContent
          showCloseButton={false}
          className="inset-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden rounded-none border-0 p-3"
        >
          <DialogTitle className="sr-only">{t("holdings:composition")}</DialogTitle>
          {compositionCard(true)}
        </DialogContent>
      </Dialog>
    </>
  );
}
