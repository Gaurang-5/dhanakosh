import { HOUSEHOLD_MODE } from "@/features/household/household-config";
import { useIsMobileViewport, usePlatform } from "@/hooks/use-platform";
import { useNavigation } from "@/pages/layouts/navigation/app-navigation";
import {
  MOBILE_NAVBAR_ITEM_LIMIT,
  MOBILE_NAVBAR_SEARCH_HREF,
  mobileNavbarCandidates,
  resolveMobileNavbarHrefs,
  useIsLandscape,
  useMobileNavbarSelection,
} from "@/pages/layouts/navigation/mobile-navbar-selection";
import { resolveNavigationIcon } from "@/pages/layouts/navigation/navigation-icons";
import { Icons } from "@wealthfolio/ui";
import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wealthfolio/ui/components/ui/card";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemSeparator,
  ItemTitle,
} from "@wealthfolio/ui/components/ui/item";
import { Switch } from "@wealthfolio/ui/components/ui/switch";
import { useTranslation } from "react-i18next";

export function MobileNavbarPicker() {
  const { t } = useTranslation();
  const { isMobile } = usePlatform();
  const isMobileViewport = useIsMobileViewport();
  const navigation = useNavigation();
  const isLandscape = useIsLandscape();
  const [saved, setSaved] = useMobileNavbarSelection();
  const showPicker = isMobile || isMobileViewport;

  const primary = navigation.primary;
  const secondary = navigation.secondary ?? [];
  const pinnedAddons = navigation.pinnedAddons ?? [];
  const addonMenuItems = navigation.addonMenuItems ?? navigation.addons ?? [];
  const candidates = mobileNavbarCandidates({
    primary,
    secondary,
    connect: {
      title: HOUSEHOLD_MODE ? t("common:import") : t("common:connect"),
      href: HOUSEHOLD_MODE ? "/import" : "/connect",
      icon: HOUSEHOLD_MODE ? (
        <Icons.FileSpreadsheet className="size-5" />
      ) : (
        <Icons.Link className="size-5" />
      ),
    },
    pinnedAddons,
    addonMenuItems,
    search: {
      title: t("common:search"),
      href: MOBILE_NAVBAR_SEARCH_HREF,
      icon: <Icons.Search2 className="size-5" />,
    },
  });
  const selectedHrefs = resolveMobileNavbarHrefs({
    saved,
    candidateHrefs: candidates.map((item) => item.href),
    primaryHrefs: primary.map((item) => item.href),
    pinnedAddonHrefs: pinnedAddons.map((item) => item.href),
    isLandscape,
  });
  const selected = new Set(selectedHrefs);

  if (!showPicker) return null;

  const toggle = (href: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) {
      if (next.size >= MOBILE_NAVBAR_ITEM_LIMIT) return;
      next.add(href);
    } else if (next.size <= 1) {
      return;
    } else {
      next.delete(href);
    }
    setSaved(candidates.map((item) => item.href).filter((itemHref) => next.has(itemHref)));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2} className="text-lg">
          {t("settings:appearance_mobile_navbar_title")}
        </CardTitle>
        <CardDescription>
          {t("settings:appearance_mobile_navbar_description", {
            count: MOBILE_NAVBAR_ITEM_LIMIT,
            more: t("common:layout.more"),
          })}
        </CardDescription>
        {saved !== null && (
          <CardAction>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSaved(null)}>
              {t("settings:appearance_mobile_navbar_reset")}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {candidates.map((item, index) => {
          const checked = selected.has(item.href);
          return (
            <div key={item.href}>
              {index > 0 ? <ItemSeparator /> : null}
              <Item size="sm" className="px-0">
                <ItemContent>
                  <ItemTitle>
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex size-7 shrink-0 items-center justify-center">
                        {resolveNavigationIcon(item.icon, "size-5")}
                      </span>
                      <span className="truncate">{item.title}</span>
                    </span>
                  </ItemTitle>
                </ItemContent>
                <ItemActions>
                  <Switch
                    checked={checked}
                    disabled={
                      (!checked && selected.size >= MOBILE_NAVBAR_ITEM_LIMIT) ||
                      (checked && selected.size <= 1)
                    }
                    aria-label={item.title}
                    onCheckedChange={(value) => toggle(item.href, value)}
                  />
                </ItemActions>
              </Item>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
