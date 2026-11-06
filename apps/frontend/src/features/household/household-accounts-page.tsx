import { useProfile } from "@/features/profiles/profile-context";
import { ProfileAvatar } from "@/features/profiles/profile-avatar";
import { Button, Icons } from "@wealthfolio/ui";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsHeader } from "@/pages/settings/settings-header";
import { getHouseholdSummary, localHouseholdDate, type HouseholdSummary } from "./household-api";
import { useHouseholdScope } from "./household-scope";

export function HouseholdAccountsPage() {
  const { t } = useTranslation("common");
  const profileContext = useProfile();
  const scope = useHouseholdScope();
  const [summary, setSummary] = useState<HouseholdSummary>();
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const members = useMemo(() => summary?.members ?? [], [summary]);

  useEffect(() => {
    let cancelled = false;
    getHouseholdSummary(localHouseholdDate())
      .then((value) => {
        if (!cancelled) setSummary(value);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const accounts = members
    .flatMap((member) => member.accounts.map((account) => ({ ...account, member })))
    .filter((account) =>
      `${account.name} ${account.group ?? ""} ${account.member.name} ${account.currency}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
    )
    .sort((a, b) => Number(a.isArchived) - Number(b.isArchived) || a.name.localeCompare(b.name));
  const visibleMembers = members.filter(
    (member) =>
      member.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) ||
      !search.trim() ||
      accounts.some((account) => account.member.id === member.id),
  );

  const manageMember = (id: string) => {
    scope?.selectMember(id, "/settings/accounts/manage");
  };

  return (
    <div className="space-y-6" data-testid="household-accounts-page">
      <SettingsHeader
        heading={t("profiles.householdAccountsTitle")}
        text={t("profiles.householdAccountsSettingsHelp")}
      >
        <Button variant="outline" size="sm" onClick={() => profileContext?.addProfile()}>
          <Icons.Plus className="size-4" />
          {t("profiles.householdAddMember")}
        </Button>
      </SettingsHeader>

      {error ? (
        <p className="text-muted-foreground rounded-lg border p-5 text-sm">
          {t("profiles.householdLoadError")}
        </p>
      ) : !summary ? (
        <div className="space-y-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-60 rounded-xl" />
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{t("profiles.householdAllAccounts")}</h2>
                <p className="text-muted-foreground text-sm">
                  {t("profiles.householdMembersCount", { number: visibleMembers.length })}
                </p>
              </div>
              <label className="flex items-center gap-2 rounded-md border px-3 py-2">
                <Icons.Search className="text-muted-foreground size-4" />
                <span className="sr-only">{t("profiles.householdSearchAccounts")}</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("profiles.householdSearchAccounts")}
                  className="bg-transparent text-sm outline-none"
                />
              </label>
            </div>
            <div className="space-y-4">
              {members.some((member) => !member.accountsAvailable) ? (
                <p className="text-warning p-4 text-xs">
                  {t("profiles.householdAccountsUnavailable")}
                </p>
              ) : null}
              {visibleMembers.length > 0 ? (
                visibleMembers.map((member) => (
                  <section key={member.id} className="bg-card overflow-hidden rounded-xl border">
                    <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
                      <ProfileAvatar id={member.avatarId} className="mx-0 size-9 rounded-full" />
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-semibold">{member.name}</h3>
                        <p className="text-muted-foreground text-xs">
                          {t("profiles.householdAccountsCount", {
                            number: accounts.filter((account) => account.member.id === member.id)
                              .length,
                          })}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => manageMember(member.id)}>
                        {t("profiles.householdManageMember")}
                      </Button>
                    </div>
                    <details className="group">
                      <summary className="text-muted-foreground cursor-pointer px-4 py-2 text-xs">
                        {t("profiles.householdUnderlyingAccounts")}
                      </summary>
                      <div className="divide-y border-t">
                        {accounts
                          .filter((account) => account.member.id === member.id)
                          .map((account) => (
                            <div key={account.id} className="flex items-center gap-3 px-4 py-3">
                              <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
                                <Icons.Wallet className="size-4" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{account.name}</p>
                                <p className="text-muted-foreground text-xs">
                                  {account.group || account.accountType}
                                  {account.isArchived
                                    ? ` · ${t("profiles.householdArchived")}`
                                    : null}
                                  {!account.isActive && !account.isArchived
                                    ? ` · ${t("profiles.householdHidden")}`
                                    : null}
                                </p>
                              </div>
                              <span className="text-muted-foreground shrink-0 text-xs">
                                {account.currency}
                              </span>
                            </div>
                          ))}
                      </div>
                    </details>
                  </section>
                ))
              ) : (
                <p className="text-muted-foreground bg-card rounded-xl border p-6 text-sm">
                  {t("profiles.householdNoAccounts")}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
