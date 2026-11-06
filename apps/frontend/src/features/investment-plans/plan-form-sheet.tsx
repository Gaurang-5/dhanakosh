import TickerSearchInput from "@/components/ticker-search";
import type { Account, Asset, SymbolSearchResult } from "@/lib/types";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@wealthfolio/ui";
import { Controller, type UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { assetLabel, type PlanFormValues } from "./plan-form";

export function PlanFormSheet({
  open,
  title,
  accounts,
  assets,
  marketAsset,
  pending,
  error,
  form,
  onOpenChange,
  onMarketAsset,
  onSubmit,
}: {
  open: boolean;
  title: string;
  accounts: Account[];
  assets: Asset[];
  marketAsset?: SymbolSearchResult;
  pending: boolean;
  error?: string;
  form: UseFormReturn<PlanFormValues>;
  onOpenChange: (open: boolean) => void;
  onMarketAsset: (result: SymbolSearchResult | undefined) => void;
  onSubmit: (values: PlanFormValues) => void;
}) {
  const { t } = useTranslation("common");
  const assetId = form.watch("assetId");
  const saved = assets.find((asset) => asset.id === assetId);
  const currencyField = form.register("currency");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{t("sip.help")}</SheetDescription>
        </SheetHeader>
        <form className="flex flex-1 flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="space-y-2">
            <Label htmlFor="sip-name">{t("sip.name")}</Label>
            <Input id="sip-name" {...form.register("name")} />
          </div>
          <Controller
            control={form.control}
            name="accountId"
            render={({ field }) => (
              <div className="space-y-2">
                <Label htmlFor="sip-account">{t("sip.account")}</Label>
                <Select
                  items={accounts.map((account) => ({
                    value: account.id,
                    label: `${account.name} (${account.currency})`,
                  }))}
                  value={field.value}
                  onValueChange={(value) => {
                    if (!value) return;
                    field.onChange(value);
                    const account = accounts.find((item) => item.id === value);
                    if (account) form.setValue("currency", account.currency);
                  }}
                >
                  <SelectTrigger id="sip-account" aria-label={t("sip.account")}>
                    <SelectValue placeholder={t("sip.choose")} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[min(31.25rem,var(--available-height))] overflow-y-auto">
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                        <span className="text-muted-foreground font-light">
                          ({account.currency})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          />
          <div className="space-y-2">
            <Label htmlFor="sip-market-search">{t("sip.asset")}</Label>
            <TickerSearchInput
              id="sip-market-search"
              placeholder={t("sip.searchMarket")}
              hideCustomCreate
              selectedResult={marketAsset}
              onSelectResult={(_symbol, result) => {
                if (!result) return;
                onMarketAsset(result);
                form.setValue("assetId", result.existingAssetId ?? `market:${result.symbol}`, {
                  shouldValidate: true,
                });
                if (result.currency) form.setValue("currency", result.currency);
              }}
              onClear={() => {
                onMarketAsset(undefined);
                form.setValue("assetId", "");
              }}
            />
            {saved && !marketAsset ? (
              <p className="text-muted-foreground text-sm">{assetLabel(saved)}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sip-amount">{t("sip.amount")}</Label>
              <Input id="sip-amount" inputMode="decimal" {...form.register("amount")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sip-currency">{t("sip.currency")}</Label>
              <Input
                id="sip-currency"
                maxLength={3}
                {...currencyField}
                onChange={(event) => {
                  event.target.value = event.target.value.toUpperCase();
                  void currencyField.onChange(event);
                }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sip-start">{t("sip.start")}</Label>
              <Input id="sip-start" type="date" {...form.register("startDate")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sip-end">{t("sip.end")}</Label>
              <Input id="sip-end" type="date" {...form.register("endDate")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sip-day">{t("sip.day")}</Label>
            <Input id="sip-day" type="number" min={1} max={31} {...form.register("dayOfMonth")} />
          </div>
          {Object.keys(form.formState.errors).length > 0 && (
            <p role="alert" className="text-destructive text-sm">
              {t("sip.invalid")}
            </p>
          )}
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <SheetFooter className="mt-auto gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button disabled={pending} type="submit">
              {t("sip.save")}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
