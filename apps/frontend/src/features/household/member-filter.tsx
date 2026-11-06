import { ProfileAvatar } from "@/features/profiles/profile-avatar";
import { Button, Icons } from "@wealthfolio/ui";
import { useTranslation } from "react-i18next";
import type { HouseholdMemberSummary } from "./household-api";

interface MemberFilterProps {
  members: HouseholdMemberSummary[];
  selectedIds: ReadonlySet<string>;
  onSelectAll: () => void;
  onToggle: (id: string) => void;
}

export function MemberFilter({ members, selectedIds, onSelectAll, onToggle }: MemberFilterProps) {
  const { t } = useTranslation("common");
  const available = members.filter((member) => member.status === "ready");
  const allSelected = available.length > 0 && selectedIds.size === available.length;

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-label={t("profiles.householdFilterTitle")}
    >
      <Button
        size="sm"
        variant={allSelected ? "default" : "outline"}
        aria-pressed={allSelected}
        onClick={onSelectAll}
      >
        <Icons.Users className="size-4" />
        {t("profiles.householdFilterAll")}
      </Button>
      {members.map((member) => {
        const selected = selectedIds.has(member.id);
        return (
          <Button
            key={member.id}
            size="sm"
            variant={!allSelected && selected ? "default" : "outline"}
            aria-pressed={selected}
            disabled={member.status !== "ready"}
            title={
              member.status === "ready" ? member.name : t("profiles.householdMemberUnavailable")
            }
            onClick={() => onToggle(member.id)}
          >
            <ProfileAvatar id={member.avatarId} className="mx-0 size-5 shrink-0 rounded-full" />
            <span className="max-w-32 truncate">{member.name}</span>
            {!allSelected && selected ? <Icons.Check className="size-4" /> : null}
          </Button>
        );
      })}
    </div>
  );
}
