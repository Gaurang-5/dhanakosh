import { useLocation, useNavigate } from "react-router-dom";
import { isHouseholdReportingRoute } from "./household-report-route";
import { useAccountScopeStore } from "@/lib/account-scope-store";
import { useProfile } from "@/features/profiles/profile-context";
import { Button, Icons } from "@wealthfolio/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@wealthfolio/ui/components/ui/popover";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { HOUSEHOLD_NAME } from "./household-config";

const SELECTION_KEY = "wealthfolio:household-selection";

interface HouseholdScopeValue {
  memberIds: string[];
  isFamily: boolean;
  label: string;
  selectAll: () => void;
  toggleMember: (id: string) => void;
  selectMember: (id: string, path?: string) => void;
  setMemberIds: (ids: string[]) => void;
}

const HouseholdScopeContext = createContext<HouseholdScopeValue | null>(null);

function readSelection(): string[] | null {
  try {
    const raw = sessionStorage.getItem(SELECTION_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.every((id) => typeof id === "string")
      ? [...new Set(parsed)]
      : null;
  } catch {
    return null;
  }
}

export function HouseholdScopeProvider({ children }: { children: ReactNode }) {
  const profile = useProfile();
  const location = useLocation();
  const navigate = useNavigate();
  const [selection, setSelection] = useState<string[] | null>(readSelection);
  const available = useMemo(
    () => profile?.profiles.filter((member) => !member.lockEnabled) ?? [],
    [profile?.profiles],
  );
  const availableIds = available.map((member) => member.id);
  const validSelection = selection?.filter((id) => availableIds.includes(id));
  const memberIds = validSelection?.length ? validSelection : availableIds;
  // One member is still a reporting filter. Only an explicit edit enters
  // that member's isolated profile and uses its write-capable services.
  const isFamily =
    isHouseholdReportingRoute(location.pathname, location.search) ||
    !validSelection?.length ||
    memberIds.length !== 1;
  const selectedMemberId = !isFamily ? memberIds[0] : undefined;
  const switchingTo = useRef<string | undefined>(undefined);
  const label =
    memberIds.length === available.length
      ? HOUSEHOLD_NAME
      : memberIds.map((id) => available.find((member) => member.id === id)?.name).join(" + ");

  useEffect(() => {
    if (
      selectedMemberId &&
      selectedMemberId !== profile?.profile?.id &&
      switchingTo.current !== selectedMemberId
    ) {
      switchingTo.current = selectedMemberId;
      profile?.selectProfile(selectedMemberId);
    }
  }, [selectedMemberId, profile]);

  function setMembers(ids: string[] | null, editing = false) {
    if (!editing && new URLSearchParams(location.search).has("memberEdit")) {
      const params = new URLSearchParams(location.search);
      params.delete("memberEdit");
      navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
    }
    useAccountScopeStore.getState().setScope({ type: "all" });
    const next = ids?.filter((id) => availableIds.includes(id));
    const normalized = next?.length ? next : null;
    setSelection(normalized);
    try {
      if (normalized) sessionStorage.setItem(SELECTION_KEY, JSON.stringify(normalized));
      else sessionStorage.removeItem(SELECTION_KEY);
    } catch {
      // In restricted browsers, the selection still works until the page reloads.
    }
  }

  const value: HouseholdScopeValue = {
    memberIds,
    isFamily,
    label,
    selectAll: () => setMembers(null),
    selectMember: (id, path) => {
      setMembers([id], true);
      const target = new URL(
        path ?? `${location.pathname}${location.search}`,
        window.location.origin,
      );
      if (isHouseholdReportingRoute(target.pathname, ""))
        target.searchParams.set("memberEdit", "1");
      navigate(`${target.pathname}${target.search}`, { replace: true });
    },
    setMemberIds: (ids) => setMembers(ids.length === availableIds.length ? null : ids),
    toggleMember: (id) => {
      if (!availableIds.includes(id)) return;
      if (selection === null) setMembers([id]);
      else if (memberIds.includes(id)) {
        if (memberIds.length > 1) setMembers(memberIds.filter((memberId) => memberId !== id));
        else setMembers(null);
      } else setMembers([...memberIds, id]);
    },
  };

  return (
    <HouseholdScopeContext.Provider value={value}>
      {selectedMemberId && selectedMemberId !== profile?.profile?.id ? (
        <div role="status" className="bg-background min-h-screen" />
      ) : (
        children
      )}
    </HouseholdScopeContext.Provider>
  );
}

export function useHouseholdScope() {
  return useContext(HouseholdScopeContext);
}

export function HouseholdScopeSelector() {
  const scope = useHouseholdScope();
  const profile = useProfile();
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  if (!scope || !profile) return null;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(scope.memberIds);
        setOpen(next);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="max-w-full gap-2"
            aria-label={t("profiles.scopeChoosePortfolio")}
          />
        }
      >
        <Icons.Users className="size-4 shrink-0" />
        <span className="max-w-48 truncate">{scope.label}</span>
        <Icons.ChevronsUpDown className="text-muted-foreground size-3.5 shrink-0" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 p-3">
        <Button
          variant="secondary"
          size="sm"
          className="w-full justify-start"
          onClick={() => {
            scope.selectAll();
            setOpen(false);
          }}
        >
          <Icons.Users className="size-4" />
          {t("profiles.householdFamilyScope")}
          {scope.memberIds.length ===
          profile.profiles.filter((member) => !member.lockEnabled).length ? (
            <Icons.Check className="ms-auto size-4" />
          ) : null}
        </Button>
        <p className="text-muted-foreground text-xs">{t("profiles.scopeChooseMembers")}</p>
        <div className="space-y-1">
          {profile.profiles.map((member) => (
            <label
              key={member.id}
              className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm"
            >
              <input
                type="checkbox"
                disabled={member.lockEnabled}
                checked={draft.includes(member.id)}
                onChange={(event) =>
                  setDraft(
                    event.target.checked
                      ? [...draft, member.id]
                      : draft.filter((id) => id !== member.id),
                  )
                }
              />
              <span className="min-w-0 flex-1 truncate">{member.name}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-between gap-2 border-t pt-3">
          <Button variant="ghost" size="sm" onClick={() => setDraft([])}>
            {t("profiles.scopeClearSelection")}
          </Button>
          <Button
            size="sm"
            disabled={!draft.length}
            onClick={() => {
              scope.setMemberIds(draft);
              setOpen(false);
            }}
          >
            {t("profiles.scopeApplySelection")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
