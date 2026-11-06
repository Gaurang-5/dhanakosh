import { useIsMobileViewport } from "@/hooks";
import { cn } from "@/lib/utils";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Calendar } from "@wealthfolio/ui/components/ui/calendar";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@wealthfolio/ui/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@wealthfolio/ui/components/ui/sheet";
import { format } from "date-fns";
import { useState } from "react";
import type { DateRange as DayPickerDateRange } from "react-day-picker";
import { useTranslation } from "react-i18next";

export interface DashboardDateRange {
  from: Date;
  to: Date;
}

interface DashboardIntervalCalendarProps {
  value?: DashboardDateRange;
  onChange: (range: DashboardDateRange | undefined) => void;
}

export function DashboardIntervalCalendar({ value, onChange }: DashboardIntervalCalendarProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobileViewport();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DayPickerDateRange | undefined>(value);

  const openPicker = (next: boolean) => {
    if (next) setDraft(value);
    setOpen(next);
  };

  const apply = () => {
    if (!draft?.from || !draft.to) return;
    onChange({ from: draft.from, to: draft.to });
    setOpen(false);
  };

  const trigger = (
    <Button
      type="button"
      variant={value ? "default" : "ghost"}
      size="sm"
      className={cn(
        "h-8 w-9 shrink-0 rounded-full p-0",
        value && "bg-primary text-primary-foreground",
      )}
      aria-label={t("ui:dateRange.chooseCustom", "Choose custom date range")}
    >
      <Icons.Calendar className="h-4 w-4" />
    </Button>
  );

  const calendar = (
    <Calendar
      mode="range"
      defaultMonth={draft?.from ?? value?.from}
      selected={draft}
      onSelect={(selected) => setDraft(selected)}
      numberOfMonths={isMobile ? 1 : 2}
      className="p-0 [--cell-size:2.5rem]"
    />
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={openPicker}>
        <SheetTrigger render={trigger} />
        <SheetContent side="bottom" className="mx-1 flex max-h-[85vh] flex-col rounded-t-2xl p-0">
          <SheetHeader className="border-border border-b px-6 py-4">
            <SheetTitle>{t("ui:dateRange.customRange", "Custom range")}</SheetTitle>
          </SheetHeader>
          <div className="flex justify-center overflow-y-auto px-5 py-5">{calendar}</div>
          <SheetFooter className="border-border flex-row gap-2 border-t px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
            >
              {t("ui:dateRange.clear", "Clear")}
            </Button>
            <Button
              type="button"
              className="ms-auto"
              onClick={apply}
              disabled={!draft?.from || !draft.to}
            >
              {t("ui:dateRange.done", "Done")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={openPicker}>
      <PopoverTrigger render={trigger} />
      <PopoverContent align="end" className="w-auto p-3">
        {calendar}
        <div className="mt-3 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(undefined);
              setOpen(false);
            }}
          >
            {t("ui:dateRange.clear", "Clear")}
          </Button>
          <Button type="button" size="sm" onClick={apply} disabled={!draft?.from || !draft.to}>
            {t("ui:dateRange.done", "Done")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function formatDashboardRange(range: DashboardDateRange): string {
  const sameYear = range.from.getFullYear() === range.to.getFullYear();
  const start = format(range.from, sameYear ? "d MMM" : "d MMM yyyy");
  return `${start} – ${format(range.to, "d MMM yyyy")}`;
}
