import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icons } from "@wealthfolio/ui";
export function ProfileMenu({ collapsed = false }: { collapsed?: boolean }) {
  const { t } = useTranslation("settings");
  return (
    <Link
      to="/settings/portfolios"
      className="flex items-center gap-2 p-3"
      title={t("portfolios.title")}
    >
      <Icons.Folder className="size-5" />
      {!collapsed && t("portfolios.title")}
    </Link>
  );
}
