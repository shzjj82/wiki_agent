import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { InfoCell } from "@/components/team/hint";
import { updateTeam, type TeamInfo } from "@/store/teamStore";
import type { RemoteSession } from "@/store/remoteStore";
import { cn } from "@/lib/utils";

export const TEAM_DETAILS_FORM = "team-details-form";

/** 与 Input 一致：聚焦时只加深边框 */
const FIELD = "border-input focus-visible:border-foreground/30";

export function TeamDetailsTab({
  session,
  shown,
  name,
  description,
  editing,
  busy,
  error,
  onName,
  onDescription,
  onShown,
  onBusy,
  onError,
  onChanged,
  onSaved,
}: {
  session: RemoteSession;
  shown: TeamInfo;
  name: string;
  description: string;
  /** 打开编辑开关后才出现输入框，否则只读展示 */
  editing: boolean;
  busy: boolean;
  error: string;
  onName: (value: string) => void;
  onDescription: (value: string) => void;
  onShown: (team: TeamInfo) => void;
  onBusy: (busy: boolean) => void;
  onError: (error: string) => void;
  onChanged: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();

  return (
    <form
      id={TEAM_DETAILS_FORM}
      className="flex min-h-0 flex-1 flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!editing || busy || !name.trim()) return;
        onBusy(true);
        onError("");
        void updateTeam(session, shown.id, { name, description })
          .then((next) => {
            onShown(next);
            onName(next.name);
            onDescription(next.description ?? "");
            onChanged();
            onSaved();
          })
          .catch((err: unknown) => onError(err instanceof Error ? err.message : t("team.saveFailed")))
          .finally(() => onBusy(false));
      }}
    >
      <div className="shrink-0">
        <InfoCell label={t("team.name")}>
          <Input id="team-detail-name" value={name} disabled={!editing} onChange={(event) => onName(event.target.value)} />
        </InfoCell>
      </div>
      <div className="flex min-h-40 flex-1 flex-col">
        <label htmlFor="team-detail-description" className="text-xs text-muted-foreground">
          {t("team.about")}
        </label>
        <textarea
          id="team-detail-description"
          value={description}
          disabled={!editing}
          placeholder={editing ? t("team.detailsPlaceholder") : t("team.noDescription")}
          onChange={(event) => onDescription(event.target.value)}
          className={cn(
            "mt-1 min-h-0 w-full flex-1 resize-none rounded-lg border bg-background px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 dark:disabled:bg-input/80",
            FIELD,
          )}
        />
      </div>
      {error ? <p className="shrink-0 text-sm text-destructive">{error}</p> : null}
    </form>
  );
}
