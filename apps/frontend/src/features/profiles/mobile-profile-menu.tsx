import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icons } from "@wealthfolio/ui";
export function MobileProfileMenu({ onAction }: { onAction: () => void }) {
  const { t } = useTranslation("settings");
  return (
    <Link to="/settings/portfolios" onClick={onAction} className="flex items-center gap-2 p-3">
      <Icons.Folder className="size-5" />
      {t("portfolios.title")}
    </Link>
  );
}
