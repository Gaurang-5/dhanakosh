import type { Layout, LayoutItem } from "react-grid-layout";

export const WIDGET_IDS = [
  "value",
  "cash",
  "invested",
  "bookCost",
  "pnl",
  "daily",
  "accounts",
  "classes",
  "regions",
  "sectors",
  "composition",
  "targets",
  "breakdown",
  "movers",
  "concentration",
] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];
export const GRID_COLUMNS = { desktop: 12, tablet: 6, mobile: 2 };
export type LayoutBreakpoint = keyof typeof GRID_COLUMNS;
export interface InsightsLayout {
  version: 7;
  hiddenWidgets: WidgetId[];
  layouts: Record<LayoutBreakpoint, LayoutItem[]>;
}

export const SUMMARY_WIDGET_IDS: readonly WidgetId[] = [
  "value",
  "cash",
  "invested",
  "bookCost",
  "pnl",
  "daily",
];
const V6_WIDGET_IDS = WIDGET_IDS.filter((id) => id !== "daily");
const PREVIOUS_WIDGET_IDS = V6_WIDGET_IDS.filter((id) => id !== "movers" && id !== "concentration");
const LEGACY_WIDGET_IDS = PREVIOUS_WIDGET_IDS.filter(
  (id) => !["cash", "invested", "bookCost", "pnl"].includes(id),
);

function mobileWidth(id: string): number {
  return id !== "value" && SUMMARY_WIDGET_IDS.includes(id as WidgetId) ? 1 : 2;
}

export function repackMobile(items: LayoutItem[]): LayoutItem[] {
  let x = 0,
    y = 0,
    rowHeight = 0;
  return [...items]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((item) => {
      const w = mobileWidth(item.i);
      if (x + w > GRID_COLUMNS.mobile) {
        x = 0;
        y += rowHeight;
        rowHeight = 0;
      }
      const next = { ...item, x, y, w };
      x += w;
      rowHeight = Math.max(rowHeight, item.h);
      return next;
    });
}

function splitSummary(items: LayoutItem[], breakpoint: LayoutBreakpoint): LayoutItem[] {
  const summary = items.find((item) => item.i === "value")!;
  const rows = breakpoint === "mobile" ? 6 : breakpoint === "tablet" ? 3 : 1;
  const extraHeight = (rows - 1) * summary.h;
  return items.flatMap<LayoutItem>((item) => {
    if (item.i !== "value") {
      return [{ ...item, y: item.y >= summary.y + summary.h ? item.y + extraHeight : item.y }];
    }
    return SUMMARY_WIDGET_IDS.map((id, index) => ({
      i: id,
      x: breakpoint === "desktop" ? index * 2 : breakpoint === "tablet" ? (index % 2) * 3 : 0,
      y:
        summary.y +
        (breakpoint === "mobile" ? index : breakpoint === "tablet" ? Math.floor(index / 2) : 0) *
          summary.h,
      w: breakpoint === "desktop" ? 2 : breakpoint === "tablet" ? 3 : 1,
      h: summary.h,
    }));
  });
}

function addPnl(items: LayoutItem[], breakpoint: LayoutBreakpoint): LayoutItem[] {
  const summaries = SUMMARY_WIDGET_IDS.filter((id) => id !== "pnl" && id !== "daily").map(
    (id) => items.find((item) => item.i === id)!,
  );
  const first = summaries[0];
  const bottom = Math.max(...summaries.map((item) => item.y + item.h));
  const height = Math.max(...summaries.map((item) => item.h));
  const atStart =
    first.y === 0 &&
    items
      .filter((item) => !SUMMARY_WIDGET_IDS.includes(item.i as WidgetId))
      .every((item) => item.y >= bottom);
  const standardDesktop =
    atStart &&
    breakpoint === "desktop" &&
    summaries.every(
      (item, index) =>
        item.y === first.y && item.x === [0, 5, 8, 10][index] && item.w === [5, 3, 2, 2][index],
    );
  const standardTablet =
    atStart &&
    breakpoint === "tablet" &&
    summaries.every(
      (item, index) =>
        item.x === (index % 2) * 3 &&
        item.w === 3 &&
        item.y === summaries[Math.floor(index / 2) * 2].y,
    ) &&
    summaries[2].y >= first.y + first.h;
  const standardMobile =
    atStart &&
    breakpoint === "mobile" &&
    summaries.every(
      (item, index) => index === 0 || item.y >= summaries[index - 1].y + summaries[index - 1].h,
    );
  let migrated = items.map((item) => ({ ...item }));
  const pnl: LayoutItem = {
    i: "pnl",
    x: standardDesktop ? 10 : 0,
    y: standardDesktop ? first.y : bottom,
    w: breakpoint === "mobile" ? 1 : breakpoint === "tablet" ? 3 : 2,
    h: height,
  };
  if (standardDesktop) {
    migrated = migrated.map((item) => {
      const index = summaries.findIndex((summary) => summary.i === item.i);
      return index < 0 ? item : { ...item, x: [0, 4, 6, 8][index], w: [4, 2, 2, 2][index] };
    });
  } else if (standardTablet || standardMobile) {
    migrated = migrated.map((item) => (item.y >= bottom ? { ...item, y: item.y + height } : item));
  }
  // Customized arrangements retain their coordinates; use the first free spot
  // below the summary group, skipping any chart that occupies that space.
  let collision = migrated.find(
    (item) =>
      pnl.x < item.x + item.w &&
      pnl.x + pnl.w > item.x &&
      pnl.y < item.y + item.h &&
      pnl.y + pnl.h > item.y,
  );
  while (collision) {
    pnl.y = collision.y + collision.h;
    collision = migrated.find(
      (item) =>
        pnl.x < item.x + item.w &&
        pnl.x + pnl.w > item.x &&
        pnl.y < item.y + item.h &&
        pnl.y + pnl.h > item.y,
    );
  }
  const insertion =
    Math.max(
      ...migrated.map((item, index) =>
        SUMMARY_WIDGET_IDS.includes(item.i as WidgetId) ? index : -1,
      ),
    ) + 1;
  migrated.splice(insertion, 0, pnl);
  return migrated;
}

const SUMMARY_BEFORE_DAILY = ["value", "cash", "invested", "bookCost", "pnl"] as const;

function insertAfterSummaries(items: LayoutItem[], daily: LayoutItem): LayoutItem[] {
  const migrated = [...items];
  const insertion =
    Math.max(
      ...migrated.map((item, index) =>
        SUMMARY_WIDGET_IDS.includes(item.i as WidgetId) ? index : -1,
      ),
    ) + 1;
  migrated.splice(Math.max(insertion, 0), 0, daily);
  return migrated;
}

function overlaps(a: LayoutItem, b: LayoutItem): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function addDaily(items: LayoutItem[], breakpoint: LayoutBreakpoint): LayoutItem[] {
  if (items.some((item) => item.i === "daily")) return items;
  const byId = (id: string) => items.find((item) => item.i === id);
  const value = byId("value");
  const cash = byId("cash");
  const invested = byId("invested");
  const book = byId("bookCost");
  const pnl = byId("pnl");
  const summaries = [value, cash, invested, book, pnl];
  if (summaries.some((item) => item == null)) {
    const height = value?.h ?? items[0]?.h ?? 100;
    return insertAfterSummaries(items, {
      i: "daily",
      x: 0,
      y: Math.max(0, ...items.map((item) => item.y + item.h)),
      w: breakpoint === "mobile" ? 1 : 2,
      h: height,
    });
  }
  const [v, c, investedCard, bookCard, pnlCard] = summaries as LayoutItem[];
  const h = v.h;
  const standardDesktop =
    breakpoint === "desktop" &&
    v.x === 0 &&
    v.w === 4 &&
    c.y === v.y &&
    c.x === 4 &&
    c.w === 2 &&
    investedCard.y === v.y &&
    investedCard.x === 6 &&
    investedCard.w === 2 &&
    bookCard.y === v.y &&
    bookCard.x === 8 &&
    bookCard.w === 2 &&
    pnlCard.y === v.y &&
    pnlCard.x === 10 &&
    pnlCard.w === 2;
  if (standardDesktop) {
    const migrated = items.map((item) => {
      const index = SUMMARY_BEFORE_DAILY.indexOf(item.i as (typeof SUMMARY_BEFORE_DAILY)[number]);
      return index < 0 ? item : { ...item, x: index * 2, w: 2 };
    });
    return insertAfterSummaries(migrated, { i: "daily", x: 10, y: v.y, w: 2, h });
  }
  const standardTablet =
    breakpoint === "tablet" &&
    v.x === 0 &&
    v.w === 3 &&
    c.x === 3 &&
    c.y === v.y &&
    c.w === 3 &&
    investedCard.x === 0 &&
    investedCard.y === v.y + h &&
    investedCard.w === 3 &&
    bookCard.x === 3 &&
    bookCard.y === v.y + h &&
    bookCard.w === 3 &&
    pnlCard.x === 0 &&
    pnlCard.y === v.y + 2 * h &&
    pnlCard.w === 3;
  if (standardTablet) {
    return insertAfterSummaries(items, {
      i: "daily",
      x: 3,
      y: pnlCard.y,
      w: 3,
      h: pnlCard.h,
    });
  }
  const standardMobile =
    breakpoint === "mobile" &&
    v.x === 0 &&
    v.w === 2 &&
    c.x === 0 &&
    c.w === 1 &&
    c.y === v.y + h &&
    investedCard.x === 1 &&
    investedCard.w === 1 &&
    investedCard.y === c.y &&
    bookCard.x === 0 &&
    bookCard.w === 1 &&
    bookCard.y === v.y + 2 * h &&
    pnlCard.x === 1 &&
    pnlCard.w === 1 &&
    pnlCard.y === bookCard.y;
  if (standardMobile) {
    const dailyY = v.y + 3 * h;
    const shifted = items.map((item) =>
      item.y >= dailyY ? { ...item, y: item.y + pnlCard.h } : item,
    );
    return insertAfterSummaries(shifted, {
      i: "daily",
      x: 0,
      y: dailyY,
      w: 1,
      h: pnlCard.h,
    });
  }
  const present = summaries as LayoutItem[];
  const bottom = Math.max(...present.map((item) => item.y + item.h));
  const daily: LayoutItem = {
    i: "daily",
    x: 0,
    y: bottom,
    w: breakpoint === "mobile" ? 1 : breakpoint === "tablet" ? 3 : 2,
    h: pnlCard.h,
  };
  let collision = items.find((item) => overlaps(daily, item));
  while (collision) {
    daily.y = collision.y + collision.h;
    collision = items.find((item) => overlaps(daily, item));
  }
  return insertAfterSummaries(items, daily);
}

function appendInsightWidgets(items: LayoutItem[], breakpoint: LayoutBreakpoint): LayoutItem[] {
  const bottom = Math.max(0, ...items.map((item) => item.y + item.h));
  const height = 360;
  return [
    ...items,
    { i: "movers", x: 0, y: bottom, w: breakpoint === "mobile" ? 2 : 6, h: height },
    {
      i: "concentration",
      x: breakpoint === "desktop" ? 6 : 0,
      y: bottom + (breakpoint === "desktop" ? 0 : height),
      w: breakpoint === "mobile" ? 2 : 6,
      h: height,
    },
  ];
}

export function defaultInsightsLayout(): InsightsLayout {
  const desktop: LayoutItem[] = [
    { i: "value", x: 0, y: 0, w: 12, h: 100 },
    ...["accounts", "classes", "regions", "sectors"].map((i, index) => ({
      i,
      x: index * 3,
      y: 100,
      w: 3,
      h: 234,
    })),
    { i: "composition", x: 0, y: 334, w: 9, h: 622 },
    { i: "targets", x: 9, y: 334, w: 3, h: 622 },
    { i: "breakdown", x: 0, y: 956, w: 12, h: 552 },
  ];
  const layouts = {
    desktop: splitSummary(desktop, "desktop"),
    tablet: splitSummary(
      desktop.map((item, index) => ({
        ...item,
        x: index >= 1 && index <= 4 ? ((index - 1) % 2) * 3 : 0,
        y:
          index == 0
            ? 0
            : index <= 4
              ? 100 + Math.floor((index - 1) / 2) * 234
              : 568 + (index - 5) * 622,
        w: index >= 1 && index <= 4 ? 3 : 6,
      })),
      "tablet",
    ),
    mobile: repackMobile(
      splitSummary(
        desktop.map((item, index) => ({ ...item, x: 0, y: index * 622, w: 1 })),
        "mobile",
      ),
    ),
  };
  return {
    version: 7,
    hiddenWidgets: [],
    layouts: Object.fromEntries(
      (Object.keys(GRID_COLUMNS) as LayoutBreakpoint[]).map((key) => [
        key,
        appendInsightWidgets(layouts[key], key),
      ]),
    ) as InsightsLayout["layouts"],
  };
}

// Persist only layout data, never library callbacks or interaction flags.
export function normalizeLayout(items: Layout, breakpoint: LayoutBreakpoint): LayoutItem[] {
  const cols = GRID_COLUMNS[breakpoint];
  return items.map(({ i, x, y, w, h }) => {
    const minW =
      breakpoint === "mobile"
        ? mobileWidth(i)
        : ["value", "cash", "invested", "bookCost", "pnl", "daily"].includes(i)
          ? 2
          : ["composition", "breakdown", "movers", "concentration"].includes(i)
            ? 6
            : 3;
    const minH = 1;
    const maxW = breakpoint === "mobile" ? minW : cols;
    const nextWidth = Math.min(maxW, Math.max(minW, w));
    return {
      i,
      x: Math.min(x, cols - nextWidth),
      y,
      w: nextWidth,
      h: Math.max(minH, h),
      minW,
      minH,
      maxW,
      maxH: 100_000,
    };
  });
}

export function readInsightsLayout(value: unknown): InsightsLayout {
  const fallback = defaultInsightsLayout();
  if (!value || typeof value !== "object") return fallback;
  const stored = value as Omit<Partial<InsightsLayout>, "version"> & { version?: number };
  if (
    ![1, 2, 3, 4, 5, 6, 7].includes(stored.version ?? 0) ||
    !Array.isArray(stored.hiddenWidgets) ||
    !stored.layouts
  )
    return fallback;
  const expectedIds: readonly WidgetId[] =
    stored.version === 7
      ? WIDGET_IDS
      : stored.version === 6
        ? V6_WIDGET_IDS
        : stored.version! >= 4
          ? PREVIOUS_WIDGET_IDS
          : stored.version === 3
            ? PREVIOUS_WIDGET_IDS.filter((id) => id !== "pnl")
            : LEGACY_WIDGET_IDS;
  for (const breakpoint of Object.keys(GRID_COLUMNS) as LayoutBreakpoint[]) {
    const items = stored.layouts[breakpoint];
    const cols = breakpoint === "mobile" && stored.version! < 5 ? 1 : GRID_COLUMNS[breakpoint];
    if (
      !Array.isArray(items) ||
      items.length !== expectedIds.length ||
      new Set(items.map((item) => item?.i)).size !== expectedIds.length ||
      items.some(
        (item) =>
          !item ||
          !expectedIds.includes(item.i as WidgetId) ||
          ![item.x, item.y, item.w, item.h].every(Number.isInteger) ||
          item.x < 0 ||
          item.y < 0 ||
          item.y > (stored.version === 1 ? 1000 : 1_000_000) ||
          item.w < 1 ||
          item.h < 1 ||
          item.h > (stored.version === 1 ? 30 : 100_000) ||
          item.x + item.w > cols,
      )
    )
      return fallback;
  }
  return {
    version: 7,
    hiddenWidgets: WIDGET_IDS.filter((id) => {
      const olderSummaries = ["value", "cash", "invested", "bookCost"] as const;
      const olderSummariesHidden = olderSummaries.every((summary) =>
        stored.hiddenWidgets!.includes(summary),
      );
      const summaryHidden = (summary: (typeof SUMMARY_BEFORE_DAILY)[number]) =>
        stored.hiddenWidgets!.includes(summary) ||
        (stored.version === 3 && summary === "pnl" && olderSummariesHidden) ||
        (stored.version! < 3 && stored.hiddenWidgets!.includes("value"));
      return (
        stored.hiddenWidgets!.includes(id) ||
        (stored.version! < 3 &&
          stored.hiddenWidgets!.includes("value") &&
          SUMMARY_WIDGET_IDS.includes(id)) ||
        (stored.version === 3 && id === "pnl" && olderSummariesHidden) ||
        (stored.version! < 7 &&
          id === "daily" &&
          SUMMARY_BEFORE_DAILY.every((summary) => summaryHidden(summary)))
      );
    }),
    layouts: Object.fromEntries(
      (Object.keys(GRID_COLUMNS) as LayoutBreakpoint[]).map((key) => {
        const items = stored.layouts![key].map((item) =>
          stored.version === 1 ? { ...item, y: item.y * 46, h: item.h * 46 } : item,
        );
        const migrated =
          stored.version! >= 4
            ? items
            : stored.version === 3
              ? addPnl(items, key)
              : splitSummary(items, key);
        let layout = normalizeLayout(
          key === "mobile" && stored.version! < 5 ? repackMobile(migrated) : migrated,
          key,
        );
        if (stored.version! < 6) {
          layout = normalizeLayout(appendInsightWidgets(layout, key), key);
        }
        if (stored.version! < 7) {
          layout = normalizeLayout(addDaily(layout, key), key);
        }
        return [key, layout];
      }),
    ) as InsightsLayout["layouts"],
  };
}

export function mergeVisibleLayout(saved: LayoutItem[], visible: Layout): LayoutItem[] {
  return saved.map((item) => visible.find((next) => next.i === item.i) ?? item);
}

export function moveWidget(
  layout: InsightsLayout,
  id: WidgetId,
  direction: -1 | 1,
): InsightsLayout {
  const ids = [...layout.layouts.mobile]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((item) => item.i);
  const index = ids.indexOf(id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= ids.length) return layout;
  [ids[index], ids[next]] = [ids[next], ids[index]];
  const layouts = { ...layout.layouts };
  for (const breakpoint of Object.keys(GRID_COLUMNS) as LayoutBreakpoint[]) {
    const ordered = ids.map((widgetId) => layouts[breakpoint].find((item) => item.i === widgetId)!);
    // Repack in reading order, preserving each widget's size.
    let x = 0,
      y = 0,
      rowHeight = 0;
    layouts[breakpoint] = ordered.map((item) => {
      if (x + item.w > GRID_COLUMNS[breakpoint]) {
        x = 0;
        y += rowHeight;
        rowHeight = 0;
      }
      const moved = { ...item, x, y };
      x += item.w;
      rowHeight = Math.max(rowHeight, item.h);
      return moved;
    });
  }
  return { ...layout, layouts };
}
