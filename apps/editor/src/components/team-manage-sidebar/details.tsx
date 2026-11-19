import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Hint, InfoCell } from "@/components/team/hint";
import { formatTeamTime, roleHint, roleLabel } from "@/components/team/text";
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
      <div className="grid shrink-0 grid-cols-1 items-start gap-3 sm:grid-cols-2">
        <InfoCell label={t("team.name")}>
          {editing ? (
            <Input id="team-detail-name" value={name} onChange={(event) => onName(event.target.value)} />
          ) : (
            <p className="truncate">{shown.name}</p>
          )}
        </InfoCell>
        <InfoCell label={t("team.role")}>
          <p className="flex items-center gap-1">
            <span>{t(roleLabel(shown.role))}</span>
            <Hint text={t(roleHint(shown.role))} />
          </p>
        </InfoCell>
        <InfoCell label={t("team.registeredAt")}>{formatTeamTime(shown.createdAt)}</InfoCell>
        <InfoCell label={t("team.updatedAt")}>{formatTeamTime(shown.updatedAt)}</InfoCell>
      </div>
      <div className="flex min-h-40 flex-1 flex-col">
        <label htmlFor="team-detail-description" className="text-xs text-muted-foreground">
          {t("team.about")}
        </label>
        {editing ? (
          <textarea
            id="team-detail-description"
            value={description}
            placeholder={t("team.detailsPlaceholder")}
            onChange={(event) => onDescription(event.target.value)}
            className={cn("mt-1 min-h-0 w-full flex-1 resize-none rounded-lg border bg-background px-2.5 py-1.5 text-sm outline-none", FIELD)}
          />
        ) : (
          <p className="mt-1 min-h-0 flex-1 overflow-auto whitespace-pre-wrap text-sm text-muted-foreground">
            {shown.description?.trim() || t("team.noDescription")}
          </p>
        )}
      </div>
      {error ? <p className="shrink-0 text-sm text-destructive">{error}</p> : null}
    </form>
  );
}
